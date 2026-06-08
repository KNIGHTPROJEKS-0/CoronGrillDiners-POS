/**
 * Singleton printer connection manager for XP-58H printers.
 * Supports Web Serial (USB), Web Bluetooth (BLE), and RawBT (Android) connections.
 * Two roles: 'cashier' (customer receipt) and 'kitchen' (kitchen ticket).
 */

export type PrinterRole = 'cashier' | 'kitchen'
export type ConnType = 'usb' | 'bluetooth' | 'rawbt' | null

// ─── Known printer identities ──────────────────────────────────────────────────
// Web Bluetooth cannot filter by MAC address (hidden for privacy by the spec),
// but name filters narrow the browser picker to only the correct device.
export const PRINTER_NAMES: Record<PrinterRole, string> = {
  cashier: 'RPP02N',   // cashier receipt printer
  kitchen: 'POS58D',   // kitchen ticket printer
}
// MAC addresses are for display/reference only — the Web Bluetooth API does not
// expose or accept MAC addresses as connection parameters.
export const PRINTER_MACS: Record<PrinterRole, string> = {
  cashier: '03:02:A6:B9:D3:C0',
  kitchen: '03:3D:5F:3E:AE:84',
}

export interface PrinterStatus {
  connected: boolean
  name: string
  type: ConnType
}

// ─── BLE GATT UUIDs for XPrinter POS58D / XP-58H family ──────────────────────
const BLE_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // XP-58H / POS58D standard
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // alternate XPrinter
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip Transparent UART
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
]
const BLE_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // XP-58H / POS58D write char
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // alternate XPrinter
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // ISSC Transparent UART write
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX (write)
]
const BLE_CHUNK = 200   // bytes per BLE write
const BLE_DELAY = 30    // ms between chunks
const USB_BAUD  = 9600  // XP-58H default serial baud rate

// ─── Module-level state ────────────────────────────────────────────────────────
const usbPorts:  Partial<Record<PrinterRole, any>> = {}
const btChars:   Partial<Record<PrinterRole, any>> = {}
const listeners: Set<() => void> = new Set()

const status: Record<PrinterRole, PrinterStatus> = {
  cashier: { connected: false, name: '', type: null },
  kitchen: { connected: false, name: '', type: null },
}

function notify() {
  listeners.forEach(fn => fn())
}

// ─── Listener registration ─────────────────────────────────────────────────────

export function subscribePrinterStatus(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPrinterStatus(role: PrinterRole): PrinterStatus {
  return { ...status[role] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when running inside an iframe (e.g. Replit preview pane). */
export function isInsideIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true // cross-origin iframe — can't access top
  }
}

/** Translates a raw DOMException from Web Serial / Web Bluetooth into a helpful message. */
function translateError(e: any): string {
  const msg: string = e?.message ?? String(e)
  if (
    msg.includes('permissions policy') ||
    msg.includes('disallowed by') ||
    msg.includes('SecurityError') ||
    e?.name === 'SecurityError'
  ) {
    return (
      'Printer access is blocked because the app is running inside an embedded preview. ' +
      'Open the app in a new browser tab to use USB or Bluetooth printing.'
    )
  }
  if (msg.includes('No port selected') || msg.includes('cancelled') || msg.includes('canceled')) {
    return 'No port selected — please pick the printer from the browser dialog.'
  }
  if (msg.includes('No device selected')) {
    return 'No device selected — please pick the printer from the browser dialog.'
  }
  return msg
}

// ─── USB (Web Serial) ──────────────────────────────────────────────────────────

export async function connectUSB(role: PrinterRole): Promise<void> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial API not supported. Use Chrome 89+ on desktop (not Safari or Firefox).')
  }
  const nav = navigator as any
  let port: any
  try {
    port = await nav.serial.requestPort()
  } catch (e: any) {
    throw new Error(translateError(e))
  }
  await port.open({ baudRate: USB_BAUD })

  await disconnectPrinter(role)

  usbPorts[role] = port
  const info = port.getInfo?.() ?? {}
  const name = info.usbVendorId
    ? `USB Printer (VID:${info.usbVendorId.toString(16).toUpperCase()})`
    : 'USB Printer'

  status[role] = { connected: true, name, type: 'usb' }
  saveMeta(role, 'usb', name)
  notify()
}

/** Silently reconnect a previously-authorized BLE printer using getDevices().
 *  Works in Chrome 85+ without showing any picker dialog.
 *  Prefers the known device name for the role; falls back to any authorized device. */
export async function autoReconnectBluetooth(role: PrinterRole): Promise<boolean> {
  const nav = navigator as any
  if (!nav.bluetooth?.getDevices) return false
  try {
    const devices: any[] = await nav.bluetooth.getDevices()
    if (!devices.length) return false

    const targetName = PRINTER_NAMES[role]
    // Prefer exact name match, then name prefix, then first available device
    const device =
      devices.find(d => d.name === targetName) ??
      devices.find(d => d.name?.startsWith(targetName.substring(0, 5))) ??
      null
    if (!device) return false

    const server = await device.gatt.connect()

    let characteristic: any = null
    for (const svcUUID of BLE_SERVICE_UUIDS) {
      try {
        const service = await server.getPrimaryService(svcUUID)
        for (const charUUID of BLE_CHAR_UUIDS) {
          try {
            characteristic = await service.getCharacteristic(charUUID)
            if (characteristic) break
          } catch { /* try next */ }
        }
        if (characteristic) break
      } catch { /* try next service */ }
    }

    if (!characteristic) {
      device.gatt.disconnect()
      return false
    }

    btChars[role] = characteristic
    const name = device.name ?? targetName
    status[role] = { connected: true, name, type: 'bluetooth' }
    saveMeta(role, 'bluetooth', name)
    notify()

    device.addEventListener('gattserverdisconnected', () => {
      delete btChars[role]
      status[role] = { connected: false, name: '', type: null }
      notify()
    })

    return true
  } catch {
    return false
  }
}

/** Re-request previously authorized USB port (auto-reconnect). */
export async function autoReconnectUSB(role: PrinterRole): Promise<boolean> {
  if (!('serial' in navigator)) return false
  try {
    const nav = navigator as any
    const ports: any[] = await nav.serial.getPorts()
    const meta = loadMeta(role)
    if (!meta || meta.type !== 'usb' || ports.length === 0) return false

    const port = ports[0]
    await port.open({ baudRate: USB_BAUD })
    usbPorts[role] = port
    status[role] = { connected: true, name: meta.name, type: 'usb' }
    notify()
    return true
  } catch {
    return false
  }
}

// ─── Bluetooth (Web BLE) ───────────────────────────────────────────────────────

export async function connectBluetooth(role: PrinterRole): Promise<void> {
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth API not supported. Use Chrome on Android or Chrome desktop (not Safari or Firefox).')
  }
  const nav = navigator as any

  await disconnectPrinter(role)

  let device: any = null
  const targetName = PRINTER_NAMES[role]

  // ONE picker dialog combining all filter strategies: exact name, name prefix,
  // and every known XPrinter service UUID. The browser shows any device that
  // matches ANY of these filters — so the right printer shows up whether it
  // advertises by name, prefix, or service UUID.
  try {
    device = await nav.bluetooth.requestDevice({
      filters: [
        { name: targetName },
        { namePrefix: targetName.substring(0, 4) },
        ...BLE_SERVICE_UUIDS.map(svc => ({ services: [svc] })),
      ],
      optionalServices: BLE_SERVICE_UUIDS,
    })
  } catch (e: any) {
    const msg: string = e?.message ?? ''
    // Security/permissions errors must surface immediately
    if (
      msg.includes('permissions policy') ||
      msg.includes('disallowed by') ||
      e?.name === 'SecurityError'
    ) throw new Error(translateError(e))

    // Filtered picker returned nothing or user cancelled — give them ONE more
    // chance via "show all BLE devices" so unbranded/renamed printers can be
    // found. After this, throw — no further dialogs.
    try {
      device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICE_UUIDS,
      })
    } catch (e2: any) {
      throw new Error(translateError(e2))
    }
  }

  const server = await device.gatt.connect()

  let characteristic: any = null
  for (const svcUUID of BLE_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(svcUUID)
      for (const charUUID of BLE_CHAR_UUIDS) {
        try {
          characteristic = await service.getCharacteristic(charUUID)
          if (characteristic) break
        } catch { /* try next */ }
      }
      if (characteristic) break
    } catch { /* try next service */ }
  }

  if (!characteristic) {
    device.gatt.disconnect()
    throw new Error(
      'Could not find printer write characteristic.\n' +
      'Make sure the XP-58H is powered on and in Bluetooth mode.'
    )
  }

  btChars[role] = characteristic
  const name = device.name ?? 'Bluetooth Printer'
  status[role] = { connected: true, name, type: 'bluetooth' }
  saveMeta(role, 'bluetooth', name)
  notify()

  device.addEventListener('gattserverdisconnected', () => {
    delete btChars[role]
    status[role] = { connected: false, name: '', type: null }
    notify()
  })
}

// ─── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectPrinter(role: PrinterRole): Promise<void> {
  const port = usbPorts[role]
  if (port) {
    try {
      if (port.readable || port.writable) await port.close()
    } catch { /* ignore */ }
    delete usbPorts[role]
  }
  const char = btChars[role]
  if (char) {
    try { char.service.device.gatt?.disconnect() } catch { /* ignore */ }
    delete btChars[role]
  }
  status[role] = { connected: false, name: '', type: null }
  clearMeta(role)
  notify()
}

// ─── Print ─────────────────────────────────────────────────────────────────────

/** Send raw ESC/POS bytes to printer. Returns the method used.
 *  For BLE connections, automatically attempts a silent reconnection if the
 *  GATT characteristic is missing (e.g. printer went to sleep / out of range).
 *  This is critical for kitchen printer reprint reliability. */
export async function printTo(role: PrinterRole, data: Uint8Array): Promise<'usb' | 'bluetooth' | 'none'> {
  const port = usbPorts[role]
  if (port) {
    const writer = port.writable?.getWriter()
    if (!writer) throw new Error('USB port not writable')
    try {
      await writer.write(data)
    } finally {
      writer.releaseLock()
    }
    return 'usb'
  }

  let char = btChars[role]

  // ── Auto-reconnect BLE if characteristic was lost (sleep/disconnect) ──
  if (!char) {
    const reconnected = await autoReconnectBluetooth(role)
    if (reconnected) {
      char = btChars[role]
    }
  }

  if (char) {
    try {
      for (let i = 0; i < data.length; i += BLE_CHUNK) {
        await char.writeValue(data.slice(i, i + BLE_CHUNK))
        if (i + BLE_CHUNK < data.length) {
          await new Promise(r => setTimeout(r, BLE_DELAY))
        }
      }
      return 'bluetooth'
    } catch (writeErr) {
      // Write failed on a stale characteristic — try one silent reconnect + retry
      console.warn(`[printer] BLE write failed for ${role}, attempting reconnect…`, writeErr)
      delete btChars[role]
      status[role] = { connected: false, name: '', type: null }
      notify()

      const reconnected = await autoReconnectBluetooth(role)
      if (reconnected) {
        char = btChars[role]
        if (char) {
          for (let i = 0; i < data.length; i += BLE_CHUNK) {
            await char.writeValue(data.slice(i, i + BLE_CHUNK))
            if (i + BLE_CHUNK < data.length) {
              await new Promise(r => setTimeout(r, BLE_DELAY))
            }
          }
          return 'bluetooth'
        }
      }
      // Reconnect failed — fall through to 'none'
      return 'none'
    }
  }

  return 'none'
}

// ─── RawBT (Android) ───────────────────────────────────────────────────────────

/** Save RawBT printer name for a role. */
export function saveRawBTPrinter(role: PrinterRole, printerName: string) {
  try { localStorage.setItem(`cgd_rawbt_${role}`, printerName) } catch { /* SSR */ }
}

/** Load RawBT printer name for a role. */
export function loadRawBTPrinter(role: PrinterRole): string | null {
  try { return localStorage.getItem(`cgd_rawbt_${role}`) } catch { return null }
}

/** Clear RawBT printer name for a role. */
export function clearRawBTPrinter(role: PrinterRole) {
  try { localStorage.removeItem(`cgd_rawbt_${role}`) } catch { /* SSR */ }
}

/** Print using RawBT intent URL. Opens RawBT app on Android using hidden iframe. */
export async function printToRawBT(role: PrinterRole, data: Uint8Array): Promise<boolean> {
  const printerName = loadRawBTPrinter(role)
  if (!printerName) return false

  try {
    // Convert Uint8Array to URL-encoded text for RawBT
    // RawBT expects URL-encoded ESC/POS commands in the text parameter
    const text = new TextDecoder().decode(data)
    const urlEncoded = encodeURIComponent(text)
    // RawBT intent URL format: rawbt://print?text={url_encoded_escpos}
    const intentUrl = `rawbt://print?text=${urlEncoded}`
    
    // Use hidden iframe to trigger intent without breaking React state
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = intentUrl
    document.body.appendChild(iframe)
    
    // Clean up iframe after a short delay
    setTimeout(() => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe)
      } catch {
        // Ignore cleanup errors
      }
    }, 100)
    
    return true
  } catch {
    return false
  }
}

// ─── localStorage metadata ─────────────────────────────────────────────────────

interface PrinterMeta { type: ConnType; name: string }

function metaKey(role: PrinterRole) { return `cgd_printer_${role}` }

function saveMeta(role: PrinterRole, type: ConnType, name: string) {
  try { localStorage.setItem(metaKey(role), JSON.stringify({ type, name })) } catch { /* SSR */ }
}

function loadMeta(role: PrinterRole): PrinterMeta | null {
  try {
    const raw = localStorage.getItem(metaKey(role))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearMeta(role: PrinterRole) {
  try { localStorage.removeItem(metaKey(role)) } catch { /* SSR */ }
}

/** Restore last-known printer name from localStorage on page load (for display only). */
export function restoreMetaStatus(role: PrinterRole) {
  const meta = loadMeta(role)
  if (meta && meta.type) {
    status[role] = { connected: false, name: meta.name, type: meta.type }
  }
}
