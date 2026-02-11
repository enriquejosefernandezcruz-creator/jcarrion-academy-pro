import fs from "node:fs";
import path from "node:path";

type ManualSeccion = { t: string; p: string[] };
type ManualModulo = { id: string; titulo: string; secciones: ManualSeccion[] };

type Gasolinera = {
  id: string;
  nombre: string;
  red: string;
  pais: string;
  status: "ok" | "condicionado";
  instrucciones: string;
};

const ROOT = process.cwd();
const SRC_DATA_DIR = path.join(ROOT, "src", "data");
const SOURCES_DIR = path.join(ROOT, "data_sources");

function fail(msg: string): never {
  console.error(`\n[build-content] ERROR: ${msg}\n`);
  process.exit(1);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(file: string): T {
  const abs = path.join(SOURCES_DIR, file);
  if (!fs.existsSync(abs)) fail(`No existe ${abs}`);
  const raw = fs.readFileSync(abs, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    fail(`JSON inválido: ${abs}`);
  }
}

/**
 * CSV parser con soporte de comillas:
 * - separa por comas SOLO cuando no está dentro de comillas
 * - soporta comillas escapadas como ""
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // "" dentro de comillas => una comilla literal
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());
  return out;
}

function parseCsv(file: string): Record<string, string>[] {
  const abs = path.join(SOURCES_DIR, file);
  if (!fs.existsSync(abs)) fail(`No existe ${abs}`);

  const raw = fs.readFileSync(abs, "utf-8").trim();
  if (!raw) return [];

  // Filtra líneas vacías (permite que tengas separadores visuales en el CSV)
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1);

  return rows.map((line, idx) => {
    const cols = splitCsvLine(line);

    if (cols.length !== headers.length) {
      fail(
        `CSV columnas no coinciden en línea ${idx + 2} (${file}). ` +
          `Esperadas=${headers.length}, Obtenidas=${cols.length}`
      );
    }

    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function assertManual(data: any): asserts data is ManualModulo[] {
  if (!Array.isArray(data)) fail("manual.json debe ser un array.");
  const ids = new Set<string>();

  for (const m of data) {
    if (!m?.id || !m?.titulo || !Array.isArray(m?.secciones)) fail("Manual: módulo inválido.");
    if (ids.has(m.id)) fail(`Manual: id duplicado: ${m.id}`);
    ids.add(m.id);

    for (const s of m.secciones) {
      if (!s?.t || !Array.isArray(s?.p)) fail(`Manual: sección inválida en módulo ${m.id}.`);
    }
  }
}

function assertGasolineras(rows: any[]): Gasolinera[] {
  const required = ["id", "nombre", "red", "pais", "status", "instrucciones"];
  const out: Gasolinera[] = [];
  const ids = new Set<string>();

  for (const r of rows) {
    for (const k of required) if (!(k in r)) fail(`Gasolineras: falta columna '${k}' en CSV.`);

    const id = String(r.id).trim();
    if (!id) fail("Gasolineras: id vacío.");
    if (ids.has(id)) fail(`Gasolineras: id duplicado: ${id}`);
    ids.add(id);

    const statusRaw = String(r.status).trim().toLowerCase();

    // Normalización y compatibilidad:
    // - ok => ok
    // - condicionado => condicionado
    // - warn => condicionado (compatibilidad histórica)
    // - cualquier otro => condicionado (fail-safe)
    const status: Gasolinera["status"] =
      statusRaw === "ok"
        ? "ok"
        : statusRaw === "condicionado" || statusRaw === "warn"
          ? "condicionado"
          : "condicionado";

    out.push({
      id,
      nombre: String(r.nombre).trim(),
      red: String(r.red).trim(),
      pais: String(r.pais).trim(),
      status,
      instrucciones: String(r.instrucciones).trim(),
    });
  }

  return out;
}

function toTsExport<T>(name: string, data: T): string {
  return `// AUTO-GENERATED. DO NOT EDIT.\nexport const ${name} = ${JSON.stringify(
    data,
    null,
    2
  )} as const;\n`;
}

function main() {
  ensureDir(SRC_DATA_DIR);

  const manual = readJson<unknown>("manual.json");
  assertManual(manual);

  const gasRows = parseCsv("gasolineras.csv");
  const gasolineras = assertGasolineras(gasRows);

  fs.writeFileSync(path.join(SRC_DATA_DIR, "manualV16.ts"), toTsExport("DATA", manual), "utf-8");
  fs.writeFileSync(
    path.join(SRC_DATA_DIR, "gasolineras.ts"),
    toTsExport("GASOLINERAS", gasolineras),
    "utf-8"
  );

  console.log(`[build-content] OK: manual=${manual.length} módulos, gasolineras=${gasolineras.length}`);
}

main();

