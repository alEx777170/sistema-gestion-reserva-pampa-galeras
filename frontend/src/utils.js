// Utilidades compartidas por las páginas

// Oracle devuelve las columnas en MAYÚSCULAS; se aceptan ambas formas
export const g = (o, k) => o?.[k.toUpperCase()] ?? o?.[k]

// Mensaje de error que devuelve el backend (o el de red)
export const errMsg = err => err?.response?.data?.error || err.message

// Nombre de las clases taxonómicas en español
export const CLASES = {
  Mammalia: 'Mamíferos', Aves: 'Aves', Reptilia: 'Reptiles', Amphibia: 'Anfibios', Insecta: 'Insectos',
  Equisetopsida: 'Plantas vasculares'
}

// Los 3 horarios fijos en que se realizan las actividades todos los días
export const HORARIOS = ['08:00', '11:00', '14:00']

// Fecha local del navegador como 'AAAA-MM-DD' (sin pasar por UTC)
export function fechaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 'AAAA-MM-DD' -> 'dd/mm/aaaa'
export const fmtFecha = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')

// 'AAAA-MM-DD' -> 'sábado 31 de octubre de 2026'
export function fmtFechaLarga(s) {
  if (!s) return '—'
  const [a, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
