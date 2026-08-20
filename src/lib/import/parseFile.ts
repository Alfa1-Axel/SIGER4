import ExcelJS from 'exceljs'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[]
}

// CSV propio (sin librería extra): separador auto-detectado entre coma y
// punto y coma (Excel en configuración regional es-AR exporta CSV con ';'
// por defecto, el resto del mundo con ','), con soporte de comillas dobles
// para valores que contengan el separador. Suficiente para el caso de uso
// real (exportar de Excel/Google Sheets), no un parser RFC 4180 completo.
function parseCsvText(text: string): ParsedSheet {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  function parseLine(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (char === '"') {
          inQuotes = false
        } else {
          current += char
        }
      } else if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        cells.push(current)
        current = ''
      } else {
        current += char
      }
    }
    cells.push(current)
    return cells
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseLine(lines[0]).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? '').trim()
    })
    return row
  })

  return { headers, rows }
}

async function parseXlsxFile(file: File): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook()
  const buffer = await file.arrayBuffer()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  const headerRow = sheet.getRow(1)
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim()
  })

  const rows: Record<string, string>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const rowData: Record<string, string> = {}
    let hasAnyValue = false
    headers.forEach((header, i) => {
      if (!header) return
      const cell = row.getCell(i + 1)
      const value = cell.value
      let text = ''
      if (value == null) text = ''
      else if (typeof value === 'object' && 'text' in value) text = String((value as { text: unknown }).text ?? '')
      else if (typeof value === 'object' && 'result' in value) text = String((value as { result: unknown }).result ?? '')
      else if (value instanceof Date) text = value.toISOString().slice(0, 10)
      else text = String(value)
      text = text.trim()
      if (text) hasAnyValue = true
      rowData[header] = text
    })
    if (hasAnyValue) rows.push(rowData)
  })

  return { headers: headers.filter(Boolean), rows }
}

// Punto de entrada único: detecta el formato por extensión y devuelve
// siempre el mismo shape (headers + filas como objetos columna->valor
// crudo, todavía sin mapear a campos de la tabla destino).
export async function parseImportFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    const text = await file.text()
    return parseCsvText(text)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsxFile(file)
  }
  throw new Error('Formato de archivo no soportado. Usá .xlsx o .csv.')
}
