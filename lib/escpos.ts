/**
 * ESC/POS command builder for XP-58H 58mm thermal printer
 * Paper: 58mm | Printable: 48mm | Font A: 32 chars/line | Font B: 42 chars/line
 */

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const CMD = {
  INIT:         [ESC, 0x40],
  CODE_PAGE_1252: [ESC, 0x74, 16], // Set code page to WCP1252 (Western European)
  ALIGN_LEFT:   [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT:  [ESC, 0x61, 0x02],
  BOLD_ON:      [ESC, 0x45, 0x01],
  BOLD_OFF:     [ESC, 0x45, 0x00],
  SIZE_NORMAL:  [GS, 0x21, 0x00],
  SIZE_2H:      [GS, 0x21, 0x01],  // double height
  SIZE_2W:      [GS, 0x21, 0x10],  // double width
  SIZE_2X:      [GS, 0x21, 0x11],  // double width + height
  CUT_PARTIAL:  [GS, 0x56, 0x01],
  FEED_3:       [ESC, 0x64, 0x03],
  FONT_A:       [ESC, 0x4d, 0x00], // 32 chars/line on 58mm
}

const W = 32 // chars per line, Font A, 58mm paper

function strToBytes(text: string): number[] {
  const out: number[] = []
  // Map common characters to Windows-1252 codes
  const win1252Map: Record<string, number> = {
    '€': 0x80,
    '‚': 0x82,
    'ƒ': 0x83,
    '„': 0x84,
    '…': 0x85,
    '†': 0x86,
    '‡': 0x87,
    'ˆ': 0x88,
    '‰': 0x89,
    'Š': 0x8a,
    '‹': 0x8b,
    'Œ': 0x8c,
    'Ž': 0x8e,
    '‘': 0x91,
    '’': 0x92,
    '“': 0x93,
    '”': 0x94,
    '•': 0x95,
    '–': 0x96,
    '—': 0x97,
    '˜': 0x98,
    '™': 0x99,
    'š': 0x9a,
    '›': 0x9b,
    'œ': 0x9c,
    'ž': 0x9e,
    'Ÿ': 0x9f,
    '¡': 0xa1,
    '¢': 0xa2,
    '£': 0xa3,
    '¤': 0xa4,
    '¥': 0xa5,
    '¦': 0xa6,
    '§': 0xa7,
    '¨': 0xa8,
    '©': 0xa9,
    'ª': 0xaa,
    '«': 0xab,
    '¬': 0xac,
    '­': 0xad,
    '®': 0xae,
    '¯': 0xaf,
    '°': 0xb0,
    '±': 0xb1,
    '²': 0xb2,
    '³': 0xb3,
    '´': 0xb4,
    'µ': 0xb5,
    '¶': 0xb6,
    '·': 0xb7,
    '¸': 0xb8,
    '¹': 0xb9,
    'º': 0xba,
    '»': 0xbb,
    '¼': 0xbc,
    '½': 0xbd,
    '¾': 0xbe,
    '¿': 0xbf,
    'À': 0xc0,
    'Á': 0xc1,
    'Â': 0xc2,
    'Ã': 0xc3,
    'Ä': 0xc4,
    'Å': 0xc5,
    'Æ': 0xc6,
    'Ç': 0xc7,
    'È': 0xc8,
    'É': 0xc9,
    'Ê': 0xca,
    'Ë': 0xcb,
    'Ì': 0xcc,
    'Í': 0xcd,
    'Î': 0xce,
    'Ï': 0xcf,
    'Ð': 0xd0,
    'Ñ': 0xd1,
    'Ò': 0xd2,
    'Ó': 0xd3,
    'Ô': 0xd4,
    'Õ': 0xd5,
    'Ö': 0xd6,
    '×': 0xd7,
    'Ø': 0xd8,
    'Ù': 0xd9,
    'Ú': 0xda,
    'Û': 0xdb,
    'Ü': 0xdc,
    'Ý': 0xdd,
    'Þ': 0xde,
    'ß': 0xdf,
    'à': 0xe0,
    'á': 0xe1,
    'â': 0xe2,
    'ã': 0xe3,
    'ä': 0xe4,
    'å': 0xe5,
    'æ': 0xe6,
    'ç': 0xe7,
    'è': 0xe8,
    'é': 0xe9,
    'ê': 0xea,
    'ë': 0xeb,
    'ì': 0xec,
    'í': 0xed,
    'î': 0xee,
    'ï': 0xef,
    'ð': 0xf0,
    'ñ': 0xf1,
    'ò': 0xf2,
    'ó': 0xf3,
    'ô': 0xf4,
    'õ': 0xf5,
    'ö': 0xf6,
    '÷': 0xf7,
    'ø': 0xf8,
    'ù': 0xf9,
    'ú': 0xfa,
    'û': 0xfb,
    'ü': 0xfc,
    'ý': 0xfd,
    'þ': 0xfe,
    'ÿ': 0xff,
  }
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 128) {
      out.push(code)
    } else if (win1252Map[ch] !== undefined) {
      out.push(win1252Map[ch])
    } else if (ch === '₱') {
      out.push(0x50) // Fallback: P for peso
    } else {
      out.push(0x3f) // ? for unknown
    }
  }
  return out
}

function line(text: string): number[] {
  return [...strToBytes(text.substring(0, W)), LF]
}

function center(text: string): number[] {
  const pad = Math.max(0, Math.floor((W - text.length) / 2))
  return line(' '.repeat(pad) + text)
}

function leftRight(left: string, right: string): number[] {
  const gap = W - left.length - right.length
  if (gap <= 0) return line(left.substring(0, W - right.length - 1) + ' ' + right)
  return line(left + ' '.repeat(gap) + right)
}

function divider(ch = '-'): number[] {
  return line(ch.repeat(W))
}

function push(b: number[], ...cmds: number[][]): void {
  cmds.forEach(c => b.push(...c))
}

// ─── Data shape ────────────────────────────────────────────────────────────────

export interface PrintData {
  orderNumber: string
  dateTime: string
  serverName: string
  tableNumber?: string
  paymentMethod: string
  items: { id: number; name: string; price: number; quantity: number }[]
  subtotal: number
  /** Senior citizen discount percentage: 0 (none), 10, or 20 */
  discountPercent: number
  /** Discount amount = subtotal × discountPercent / 100 */
  discountAmount: number
  grandTotal: number
  amountTendered: number
  change: number
}

// ─── Customer Receipt ──────────────────────────────────────────────────────────

export function buildCustomerReceipt(d: PrintData): Uint8Array {
  const b: number[] = []

  push(b, CMD.INIT, CMD.CODE_PAGE_1252, CMD.FONT_A)

  // Header
  push(b, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_2H)
  b.push(...line('CORON GRILL DINERS'))
  push(b, CMD.SIZE_NORMAL, CMD.BOLD_OFF)
  b.push(...line('Beside Panda House, 1 Don Pedro'))
  b.push(...line("Brgy. Poblacion, Coron, Palawan"))
  b.push(...line('Tel: 0917-123-4567'))
  b.push(...divider())

  // Order info
  push(b, CMD.ALIGN_LEFT)
  b.push(...leftRight('Date:', d.dateTime.substring(0, 20)))
  b.push(...leftRight('Order #:', d.orderNumber))
  b.push(...leftRight('Server:', d.serverName))
  if (d.tableNumber) b.push(...leftRight('Table #:', d.tableNumber))
  b.push(...leftRight('Payment:', d.paymentMethod.toUpperCase()))
  b.push(...divider())

  // Items header
  push(b, CMD.BOLD_ON)
  b.push(...line('QTY  ITEM               PRICE'))
  push(b, CMD.BOLD_OFF)
  b.push(...divider())

  // Items
  for (const item of d.items) {
    const qty = `${item.quantity}x`.padEnd(4)
    const price = `P${(item.price * item.quantity).toFixed(2)}`
    const nameLen = W - qty.length - price.length - 1
    const name = item.name.substring(0, nameLen).padEnd(nameLen)
    b.push(...line(`${qty}${name} ${price}`))
  }
  b.push(...divider())

  // Totals
  b.push(...leftRight('Subtotal:', `P${d.subtotal.toFixed(2)}`))
  if (d.discountPercent > 0) {
    b.push(...leftRight(`Sr. Citizen Disc.(${d.discountPercent}%):`, `-P${d.discountAmount.toFixed(2)}`))
  }
  push(b, CMD.BOLD_ON)
  b.push(...leftRight('GRAND TOTAL:', `P${d.grandTotal.toFixed(2)}`))
  push(b, CMD.BOLD_OFF)
  if (d.paymentMethod === 'cash') {
    b.push(...leftRight('Tendered:', `P${d.amountTendered.toFixed(2)}`))
    push(b, CMD.BOLD_ON)
    b.push(...leftRight('Change:', `P${d.change.toFixed(2)}`))
    push(b, CMD.BOLD_OFF)
  }
  b.push(...divider())

  // Footer
  push(b, CMD.ALIGN_CENTER)
  b.push(...center('Thank you for dining!'))
  b.push(...center('Visit us again in Coron!'))
  b.push(...center('--- END OF RECEIPT ---'))

  push(b, CMD.FEED_3, CMD.CUT_PARTIAL)
  return new Uint8Array(b)
}

// ─── Kitchen Ticket ────────────────────────────────────────────────────────────

export function buildKitchenTicket(d: PrintData): Uint8Array {
  const b: number[] = []

  push(b, CMD.INIT, CMD.CODE_PAGE_1252, CMD.FONT_A)

  // Header
  push(b, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_2X)
  b.push(...line('** KITCHEN **'))
  push(b, CMD.SIZE_NORMAL, CMD.BOLD_OFF)
  b.push(...divider('='))

  // Order info
  push(b, CMD.ALIGN_LEFT)
  b.push(...leftRight('Order #:', d.orderNumber))
  // Extract time portion from dateTime string
  const timePart = d.dateTime.includes(',')
    ? d.dateTime.split(',').pop()?.trim() ?? d.dateTime
    : d.dateTime
  b.push(...leftRight('Time:', timePart))
  b.push(...leftRight('Server:', d.serverName))
  if (d.tableNumber) {
    push(b, CMD.BOLD_ON)
    b.push(...leftRight('Table #:', d.tableNumber))
    push(b, CMD.BOLD_OFF)
  }
  b.push(...divider('='))

  // Items — large text, no prices
  for (const item of d.items) {
    push(b, CMD.SIZE_2H, CMD.BOLD_ON)
    b.push(...line(` ${item.quantity}x  ${item.name.substring(0, 27)}`))
    push(b, CMD.SIZE_NORMAL, CMD.BOLD_OFF)
  }

  b.push(...divider('='))
  push(b, CMD.ALIGN_CENTER)
  b.push(...center('** END OF ORDER **'))

  push(b, CMD.FEED_3, CMD.CUT_PARTIAL)
  return new Uint8Array(b)
}
