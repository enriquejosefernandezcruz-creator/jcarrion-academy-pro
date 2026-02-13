/// <reference types="@cloudflare/workers-types" />
// ==============================
// FILE: src/accessControlDO.ts
// Durable Object para cuotas por token y auditoría mínima
// ==============================

export type Role = "MASTER" | "DRIVER" | "ADMIN";

export type TokenRecord = {
  token: string;
  id: string;
  name?: string;
  role: Role;
  active: boolean;
  limits?: { perDay?: number; perMonth?: number };
  expiresAt?: string; // ISO
};

type Counters = {
  dayKey: string;       // YYYY-MM-DD (UTC)
  monthKey: string;     // YYYY-MM (UTC)
  dayCount: number;
  monthCount: number;
};

type AuditEvent = {
  ts: string;           // ISO
  tokenHash: string;    // sha256(token) recortado
  role: Role;
  path: string;
  ok: boolean;
  reason?: string;
};

function utcDayKey(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function utcMonthKey(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export class AccessControlDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/check") {
      const body = await req.json().catch(() => null) as any;
      if (!body?.tokenHash || !body?.role || !body?.path) {
        return new Response(JSON.stringify({ ok: false, reason: "bad_request" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const { tokenHash, role, path, limits, unlimited, nowISO } = body as {
        tokenHash: string;
        role: Role;
        path: string;
        limits?: { perDay?: number; perMonth?: number };
        unlimited?: boolean;
        nowISO?: string;
      };

      // Si unlimited => auditar y permitir sin tocar contadores
      if (unlimited) {
        await this.appendAudit({
          ts: nowISO ?? new Date().toISOString(),
          tokenHash,
          role,
          path,
          ok: true,
        });
        return this.json({ ok: true });
      }

      const now = new Date(nowISO ?? new Date().toISOString());
      const dayKey = utcDayKey(now);
      const monthKey = utcMonthKey(now);

      const key = `counters:${tokenHash}`;
      const current = (await this.state.storage.get<Counters>(key)) ?? {
        dayKey,
        monthKey,
        dayCount: 0,
        monthCount: 0,
      };

      // Reset automático al cambiar día/mes
      let dayCount = current.dayCount;
      let monthCount = current.monthCount;

      if (current.dayKey !== dayKey) dayCount = 0;
      if (current.monthKey !== monthKey) monthCount = 0;

      const perDay = limits?.perDay;
      const perMonth = limits?.perMonth;

      // Chequeo límites ANTES de incrementar
      if (typeof perDay === "number" && dayCount >= perDay) {
        await this.appendAudit({
          ts: now.toISOString(),
          tokenHash,
          role,
          path,
          ok: false,
          reason: "limit_day",
        });
        return this.json({
          ok: false,
          reason: "limit_day",
          used: { day: dayCount, month: monthCount },
          limits: { perDay, perMonth },
        }, 429);
      }

      if (typeof perMonth === "number" && monthCount >= perMonth) {
        await this.appendAudit({
          ts: now.toISOString(),
          tokenHash,
          role,
          path,
          ok: false,
          reason: "limit_month",
        });
        return this.json({
          ok: false,
          reason: "limit_month",
          used: { day: dayCount, month: monthCount },
          limits: { perDay, perMonth },
        }, 429);
      }

      // Incremento
      dayCount += 1;
      monthCount += 1;

      await this.state.storage.put<Counters>(key, {
        dayKey,
        monthKey,
        dayCount,
        monthCount,
      });

      await this.appendAudit({
        ts: now.toISOString(),
        tokenHash,
        role,
        path,
        ok: true,
      });

      return this.json({
        ok: true,
        used: { day: dayCount, month: monthCount },
        limits: { perDay, perMonth },
      });
    }

    if (url.pathname === "/audit") {
      // Devuelve últimos N eventos. Protegerlo por MASTER si se expone públicamente.
      const body = await req.json().catch(() => ({})) as any;
      const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 500);

      const events = (await this.state.storage.get<AuditEvent[]>("audit")) ?? [];
      const sliced = events.slice(-limit).reverse();
      return this.json({ ok: true, events: sliced });
    }

    return new Response("Not Found", { status: 404 });
  }

  private async appendAudit(ev: AuditEvent) {
    const key = "audit";
    const existing = (await this.state.storage.get<AuditEvent[]>(key)) ?? [];
    existing.push(ev);

    // Retención simple (p.ej. 2000 eventos por DO)
    const MAX = 2000;
    const trimmed = existing.length > MAX ? existing.slice(existing.length - MAX) : existing;
    await this.state.storage.put(key, trimmed);
  }

  private json(obj: unknown, status = 200): Response {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
}
