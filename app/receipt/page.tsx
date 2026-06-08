'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { printTo, printToRawBT, loadRawBTPrinter, saveRawBTPrinter } from '@/lib/printer-connection'
import { buildCustomerReceipt, buildKitchenTicket, type PrintData } from '@/lib/escpos'

const STORAGE_KEY = 'cgd_active_receipt'
const MAX_AGE_MS  = 10 * 60 * 1000

type Selection = 'cashier' | 'kitchen'

interface ReceiptEntry {
  receiptText:       string
  kitchenText?:      string
  /** True when the cashier ticked "Also print kitchen ticket" — controls
   *  auto-print on mount. The kitchen preview card and manual Print Kitchen
   *  Receipt button always render whenever kitchenText is present. */
  autoPrintKitchen?: boolean
  /** Controls whether ANY printing happens automatically on mount.
   *  Undefined/true → auto-print (normal checkout flow).
   *  false → manual only: the page just renders the receipt + print buttons
   *  so the cashier can reprint to both printers reliably (used by reprint). */
  autoPrint?:        boolean
  orderNumber:       string
  printDataJson:     string
  returnPath:        string
  ts:                number
}

export default function ReceiptPage() {
  const router = useRouter()
  const [entry, setEntry]             = useState<ReceiptEntry | null>(null)
  const [selected, setSelected]       = useState<Selection>('cashier')
  const [cashierDone, setCashierDone] = useState(false)
  const [kitchenDone, setKitchenDone] = useState(false)
  const autoPrintedRef                = useRef(false)
  const [showPrinterSetup, setShowPrinterSetup] = useState(false)
  const [cashierPrinterName, setCashierPrinterName] = useState('')
  const [kitchenPrinterName, setKitchenPrinterName] = useState('')

  // ── Load receipt data from localStorage ─────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const d = JSON.parse(raw) as ReceiptEntry
        if (Date.now() - d.ts < MAX_AGE_MS) {
          localStorage.removeItem(STORAGE_KEY)
          setEntry(d)
          return
        }
      }
    } catch {}
  }, [])

  // ── Load existing printer names ─────────────────────────────────────────────
  useEffect(() => {
    const cashierName = loadRawBTPrinter('cashier')
    const kitchenName = loadRawBTPrinter('kitchen')
    if (cashierName) setCashierPrinterName(cashierName)
    if (kitchenName) setKitchenPrinterName(kitchenName)
  }, [])

  // ── Check if printers are configured ──────────────────────────────────────────
  const printersConfigured = cashierPrinterName.length > 0 && (!entry?.kitchenText || kitchenPrinterName.length > 0)

  // ── Auto-print on mount via Web Bluetooth/USB (preferred for dual printer) or RawBT ─────
  // /receipt is navigated to in the SAME browser tab (router.push from checkout),
  // so the module-level btChars state in lib/printer-connection.ts is preserved
  // and printTo() can reach both printers without any RawBT bridge.
  useEffect(() => {
    if (!entry || autoPrintedRef.current) return
    autoPrintedRef.current = true
    // Reprint flow: skip auto-printing entirely. The cashier reviews the
    // receipt and taps "Print Cashier Receipt" / "Print Kitchen Ticket" to
    // print to both printers reliably (same path as Printer Setup test prints).
    if (entry.autoPrint === false) {
      toast.info('Tap Print Cashier Receipt and Print Kitchen Ticket to reprint.')
      return
    }
    let pd: PrintData | null = null
    try { pd = JSON.parse(entry.printDataJson) } catch {}
    if (!pd) return
    const finalPd = pd
    ;(async () => {
      try {
        // Prioritize Web Bluetooth/USB for dual printer support (can connect to specific devices by name)
        // Web Bluetooth supports simultaneous connections to both RPP02N (cashier) and POS58D (kitchen)
        let cashierOk = false
        try {
          const cashierResult = await printTo('cashier', buildCustomerReceipt(finalPd))
          cashierOk = cashierResult !== 'none'
          
          // Print kitchen ticket if auto-print is enabled
          if (cashierOk && entry.autoPrintKitchen && entry.kitchenText) {
            try {
              await printTo('kitchen', buildKitchenTicket(finalPd))
              setKitchenDone(true)
            } catch (err) {
              console.error('BLE/USB kitchen print failed:', err)
            }
          }
        } catch (err) {
          console.error('BLE/USB cashier print failed:', err)
        }
        
        // Fall back to RawBT only if Web Bluetooth/USB not connected
        // Note: RawBT uses the default printer set in the app, so it can only print to one printer at a time
        if (!cashierOk) {
          try {
            const cashierRawbtSuccess = await printToRawBT('cashier', buildCustomerReceipt(finalPd))
            cashierOk = cashierRawbtSuccess
            if (cashierOk && entry.autoPrintKitchen && entry.kitchenText) {
              await printToRawBT('kitchen', buildKitchenTicket(finalPd))
              setKitchenDone(true)
            }
          } catch (err) {
            console.error('RawBT cashier print failed:', err)
            toast.error('Receipt could not print automatically', {
              description: 'RawBT printer not configured or unavailable'
            })
          }
        }
        
        if (cashierOk) setCashierDone(true)

        // If everything that was supposed to auto-print succeeded, return to POS
        // after a brief success flash.
        if (cashierOk && (!entry.autoPrintKitchen || kitchenDone)) {
          setTimeout(() => router.push(entry.returnPath || '/'), 1800)
        }
      } catch (err) {
        console.error('Auto-print failed completely:', err)
        toast.error('Printing failed', {
          description: 'Please try printing manually from the receipt page'
        })
        // Don't crash the page - just log the error and let the user see the receipt
      }
    })()
  }, [entry])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getPrintData(): PrintData | null {
    if (!entry?.printDataJson) return null
    try { return JSON.parse(entry.printDataJson) } catch { return null }
  }

  async function doPrintCashier() {
    const pd = getPrintData()
    if (!pd) return
    try {
      // Try RawBT first (safe iframe method)
      const rawbtSuccess = await printToRawBT('cashier', buildCustomerReceipt(pd))
      if (rawbtSuccess) { setCashierDone(true); return }
    } catch (err) {
      console.error('RawBT cashier print failed:', err)
      toast.error('Receipt could not print', {
        description: 'RawBT printer not configured or unavailable'
      })
    }
    try {
      // Fall back to direct BLE/USB
      const result = await printTo('cashier', buildCustomerReceipt(pd))
      if (result !== 'none') { setCashierDone(true); return }
    } catch (err) {
      console.error('BLE/USB cashier print failed:', err)
      toast.error('Receipt could not print', {
        description: 'No printer connected'
      })
    }
    // No direct BLE/USB — share cashier receipt text via Android share sheet → RawBT
    if (entry?.receiptText) {
      shareTxt(
        entry.receiptText,
        `receipt-${sanitize(entry.orderNumber)}.txt`,
        'Cashier Receipt ' + entry.orderNumber,
      )
    }
  }

  async function doPrintKitchen() {
    const pd = getPrintData()
    if (!pd) return
    try {
      // Try RawBT first (safe iframe method)
      const rawbtSuccess = await printToRawBT('kitchen', buildKitchenTicket(pd))
      if (rawbtSuccess) { setKitchenDone(true); return }
    } catch (err) {
      console.error('RawBT kitchen print failed:', err)
      toast.error('Kitchen ticket could not print', {
        description: 'RawBT printer not configured or unavailable'
      })
    }
    try {
      // Fall back to direct BLE/USB
      const result = await printTo('kitchen', buildKitchenTicket(pd))
      if (result !== 'none') { setKitchenDone(true); return }
    } catch (err) {
      console.error('BLE/USB kitchen print failed:', err)
      toast.error('Kitchen ticket could not print', {
        description: 'No printer connected'
      })
    }
    // No direct BLE/USB — share kitchen ticket text via Android share sheet → RawBT
    const text = entry?.kitchenText ?? fallbackKitchenText(pd)
    shareTxt(
      text,
      `kitchen-${sanitize(entry?.orderNumber ?? 'ticket')}.txt`,
      'Kitchen Ticket ' + (entry?.orderNumber ?? ''),
    )
  }

  // Save .txt for the SELECTED receipt card (emergency fallback)
  function doSaveTxt() {
    if (!entry) return
    if (selected === 'cashier') {
      shareTxt(
        entry.receiptText,
        `receipt-${sanitize(entry.orderNumber)}.txt`,
        'Cashier Receipt ' + entry.orderNumber,
      )
    } else {
      const pd = getPrintData()
      const text = entry.kitchenText ?? (pd ? fallbackKitchenText(pd) : '')
      shareTxt(
        text,
        `kitchen-${sanitize(entry.orderNumber)}.txt`,
        'Kitchen Ticket ' + entry.orderNumber,
      )
    }
  }

  function fallbackKitchenText(pd: PrintData): string {
    const sep = '='.repeat(32)
    const lines = ['** KITCHEN **', sep, `Order #:  ${pd.orderNumber}`]
    const timePart = pd.dateTime.includes(',')
      ? pd.dateTime.split(',').pop()?.trim() ?? pd.dateTime
      : pd.dateTime
    lines.push(`Time:     ${timePart}`, `Server:   ${pd.serverName}`)
    if (pd.tableNumber) lines.push(`Table #:  ${pd.tableNumber}`)
    lines.push(sep)
    for (const item of pd.items) lines.push(`${item.quantity}x  ${item.name}`)
    lines.push(sep, '** END OF ORDER **')
    return lines.join('\n')
  }

  function sanitize(s: string) { return s.replace(/[^a-zA-Z0-9-]/g, '') }

  function shareTxt(text: string, filename: string, title: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const file = new File([blob], filename, { type: 'text/plain' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title }).catch(() => downloadBlob(blob, filename))
      return
    }
    downloadBlob(blob, filename)
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 150)
  }

  function doBackToPOS() { router.push(entry?.returnPath ?? '/') }

  const hasKitchen = !!entry?.kitchenText
  const allDone    = cashierDone && (!hasKitchen || kitchenDone)

  // ── Print styles (58mm thermal for window.print) ─────────────────────────────
  const printStyles = `
    @media print {
      @page { size: 58mm auto; margin: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body, html { background: #fff !important; width: 58mm !important; margin: 0 !important; padding: 0 !important; }
      #toolbar, #hint, #emergencyBack, #kitchenCard { display: none !important; }
      #cashierCard { margin: 0 !important; padding: 0 !important; box-shadow: none !important;
                     border-radius: 0 !important; background: #fff !important; width: 58mm !important; }
      #receiptPre { width: 58mm !important; font-size: 9pt !important; line-height: 1.3 !important;
                    color: #000 !important; white-space: pre !important; }
    }
  `

  // ── Loading state ────────────────────────────────────────────────────────────
  if (!entry) {
    return (
      <>
        <style>{printStyles}</style>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                      height:'100vh', background:'#111827', color:'#9ca3af',
                      fontFamily:'sans-serif', fontSize:15 }}>
          Loading receipt…
        </div>
      </>
    )
  }

  // ── Shared card styles ───────────────────────────────────────────────────────
  const cardBase: React.CSSProperties = {
    flex: '1 1 0', minWidth: 200, maxWidth: 340, cursor: 'pointer',
    borderRadius: 10, padding: '12px 10px', background: '#fff',
    boxShadow: '0 4px 16px rgba(0,0,0,.18)',
    transition: 'box-shadow .15s, outline .15s',
    userSelect: 'none',
  }
  const cashierSelected = selected === 'cashier'
  const kitchenSelected = selected === 'kitchen'

  return (
    <>
      <style>{printStyles}</style>

      {/* ── Sticky Toolbar ───────────────────────────────────────────────────── */}
      <div id="toolbar" style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#111827',
        padding: '10px 14px', display: 'flex', gap: 8,
        alignItems: 'center', flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}>
        {/* Order label */}
        <span style={{ color: '#9ca3af', fontSize: 11, flex: 1, minWidth: 80 }}>
          Order {entry.orderNumber}
        </span>

        {/* Print Cashier Receipt — always routes to cashier printer */}
        <button onClick={doPrintCashier} style={{
          border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          background: cashierDone ? '#15803d' : '#16a34a', color: '#fff',
          boxShadow: '0 2px 8px rgba(22,163,74,.4)',
          fontSize: 13, padding: '10px 16px', fontWeight: 700,
        }}>
          {cashierDone ? '✅ Receipt Printed' : '🖨 Print Cashier Receipt'}
        </button>

        {/* Print Kitchen Ticket — always routes to kitchen printer */}
        {hasKitchen && (
          <button onClick={doPrintKitchen} style={{
            border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
            background: kitchenDone ? '#b45309' : '#d97706', color: '#fff',
            boxShadow: '0 2px 8px rgba(217,119,6,.4)',
            fontSize: 13, padding: '10px 16px', fontWeight: 700,
          }}>
            {kitchenDone ? '✅ Kitchen Printed' : '🍳 Print Kitchen Ticket'}
          </button>
        )}

        {/* Save .txt — saves whichever receipt card is currently selected */}
        <button onClick={doSaveTxt} title={`Save ${selected === 'cashier' ? 'cashier receipt' : 'kitchen ticket'} as .txt`} style={{
          border: '1.5px solid rgba(255,255,255,.2)', borderRadius: 6,
          padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap', background: 'transparent', color: '#e5e7eb',
        }}>
          💾 Save {selected === 'cashier' ? 'Cashier' : 'Kitchen'} .txt
        </button>

        {/* PDF via browser print dialog */}
        <button onClick={() => window.print()} style={{
          border: '1.5px solid rgba(255,255,255,.2)', borderRadius: 6,
          padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap', background: 'transparent', color: '#e5e7eb',
        }}>
          📄 Save .pdf
        </button>

        {/* Back to POS */}
        <button onClick={doBackToPOS} style={{
          border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 12,
          fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          background: '#dc2626', color: '#fff',
          boxShadow: '0 2px 8px rgba(220,38,38,.35)',
        }}>
          ← Back to POS
        </button>

        {/* Retry Print (for when printers are configured after initial load) */}
        {printersConfigured && (
          <button
            onClick={async () => {
              const pd = getPrintData()
              if (!pd) return
              try {
                await doPrintCashier()
                if (hasKitchen) await doPrintKitchen()
                toast.success('Retry print successful')
              } catch (err) {
                console.error('Retry print failed:', err)
                toast.error('Retry print failed')
              }
            }}
            style={{
              border: '1.5px solid rgba(255,255,255,.2)', borderRadius: 6,
              padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', background: 'transparent', color: '#e5e7eb',
            }}
          >
            🔄 Retry Print
          </button>
        )}
      </div>

      {/* ── Printer Setup Banner (shown when printers not configured) ───────────── */}
      {!printersConfigured && (
        <div style={{
          background: '#92400e', border: '1px solid #f59e0b', borderRadius: 8,
          margin: '12px 16px', padding: '12px 16px', color: '#fef3c7',
          textAlign: 'center', fontSize: 14, fontFamily: 'sans-serif',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ No printer connected yet</div>
          <div style={{ marginBottom: 12 }}>Please set up your printers to print this receipt.</div>
          <button
            onClick={() => setShowPrinterSetup(!showPrinterSetup)}
            style={{
              border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: '#f59e0b', color: '#1f2937',
            }}
          >
            {showPrinterSetup ? 'Hide Printer Setup' : '⚙️ Setup Printers'}
          </button>
        </div>
      )}

      {/* ── Inline Printer Setup (shown when banner button clicked) ─────────────── */}
      {showPrinterSetup && (
        <div style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
          margin: '0 16px 12px', padding: '16px', color: '#e5e7eb',
          fontFamily: 'sans-serif',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Printer Setup (RawBT)</div>
          
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
              Cashier Printer Name
            </label>
            <input
              type="text"
              placeholder="e.g., RPP02N"
              value={cashierPrinterName}
              onChange={(e) => setCashierPrinterName(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,.2)', background: '#0f172a',
                color: '#e5e7eb', fontSize: 13,
              }}
            />
          </div>

          {hasKitchen && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
                Kitchen Printer Name
              </label>
              <input
                type="text"
                placeholder="e.g., POS58D"
                value={kitchenPrinterName}
                onChange={(e) => setKitchenPrinterName(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,.2)', background: '#0f172a',
                  color: '#e5e7eb', fontSize: 13,
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                saveRawBTPrinter('cashier', cashierPrinterName)
                if (hasKitchen) saveRawBTPrinter('kitchen', kitchenPrinterName)
                setShowPrinterSetup(false)
                toast.success('Printers configured successfully')
              }}
              disabled={!cashierPrinterName.trim() || (hasKitchen && !kitchenPrinterName.trim())}
              style={{
                flex: 1, border: 'none', borderRadius: 6, padding: '10px 16px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: '#16a34a', color: '#fff',
                opacity: (!cashierPrinterName.trim() || (hasKitchen && !kitchenPrinterName.trim())) ? 0.5 : 1,
              }}
            >
              Save & Print
            </button>
            <button
              onClick={() => setShowPrinterSetup(false)}
              style={{
                border: '1px solid rgba(255,255,255,.2)', borderRadius: 6,
                padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', color: '#e5e7eb',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Success banner ───────────────────────────────────────────────────── */}
      {allDone && (
        <div style={{
          background: '#052e16', border: '1px solid #16a34a', borderRadius: 8,
          margin: '12px 16px', padding: '12px 16px', color: '#4ade80',
          textAlign: 'center', fontSize: 14, fontFamily: 'sans-serif',
        }}>
          ✅ Printed successfully! Returning to POS…
        </div>
      )}

      {/* ── Instruction banner ───────────────────────────────────────────────── */}
      {!allDone && (
        <div style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
          margin: '12px 16px', padding: '10px 16px', color: '#94a3b8',
          textAlign: 'center', fontSize: 12, fontFamily: 'sans-serif', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#e2e8f0' }}>Tap a receipt card to select it</strong>
          {' '}— the selected card determines which file is saved when you tap{' '}
          <strong style={{ color: '#e2e8f0' }}>💾 Save .txt</strong>.
          {' '}Print buttons always route to their own printer regardless of selection.
        </div>
      )}

      {/* ── Receipt cards row ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16,
        justifyContent: 'center', padding: '16px 16px 0',
      }}>

        {/* ── Cashier Receipt Card ─────────────────────────────────────────── */}
        <div
          id="cashierCard"
          onClick={() => setSelected('cashier')}
          style={{
            ...cardBase,
            outline: cashierSelected ? '3px solid #16a34a' : '2px solid rgba(0,0,0,.08)',
            boxShadow: cashierSelected
              ? '0 0 0 4px rgba(22,163,74,.18), 0 4px 16px rgba(0,0,0,.18)'
              : '0 4px 16px rgba(0,0,0,.18)',
          }}
        >
          {/* Card header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            padding: '6px 8px', borderRadius: 6,
            background: cashierSelected ? '#dcfce7' : '#f1f5f9',
          }}>
            <span style={{ fontSize: 16 }}>🖨</span>
            <span style={{
              fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13,
              color: cashierSelected ? '#15803d' : '#475569',
            }}>
              Cashier Receipt
            </span>
            {cashierDone && (
              <span style={{ marginLeft: 'auto', color: '#15803d', fontSize: 12, fontWeight: 700 }}>
                ✅ Printed
              </span>
            )}
            {cashierSelected && !cashierDone && (
              <span style={{
                marginLeft: 'auto', background: '#16a34a', color: '#fff',
                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              }}>
                SELECTED
              </span>
            )}
          </div>

          {/* Receipt text preview */}
          <div style={{
            background: '#f8fafc', borderRadius: 6, padding: '10px 8px',
            maxHeight: 420, overflow: 'auto',
            border: '1px solid rgba(0,0,0,.07)',
          }}>
            <pre id="receiptPre" style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '10px', lineHeight: 1.45, color: '#111',
              margin: 0, whiteSpace: 'pre',
            }}>
              {entry.receiptText}
            </pre>
          </div>

          {/* Print shortcut at bottom of card */}
          <button
            onClick={e => { e.stopPropagation(); doPrintCashier() }}
            style={{
              marginTop: 10, width: '100%', border: 'none', borderRadius: 6,
              padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: cashierDone ? '#15803d' : '#16a34a', color: '#fff',
            }}
          >
            {cashierDone ? '✅ Reprint Cashier' : '🖨 Print Cashier Receipt'}
          </button>
        </div>

        {/* ── Kitchen Ticket Card ───────────────────────────────────────────── */}
        {hasKitchen && (
          <div
            id="kitchenCard"
            onClick={() => setSelected('kitchen')}
            style={{
              ...cardBase,
              outline: kitchenSelected ? '3px solid #d97706' : '2px solid rgba(0,0,0,.08)',
              boxShadow: kitchenSelected
                ? '0 0 0 4px rgba(217,119,6,.18), 0 4px 16px rgba(0,0,0,.18)'
                : '0 4px 16px rgba(0,0,0,.18)',
            }}
          >
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
              padding: '6px 8px', borderRadius: 6,
              background: kitchenSelected ? '#fef3c7' : '#f1f5f9',
            }}>
              <span style={{ fontSize: 16 }}>🍳</span>
              <span style={{
                fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13,
                color: kitchenSelected ? '#b45309' : '#475569',
              }}>
                Kitchen Ticket
              </span>
              {kitchenDone && (
                <span style={{ marginLeft: 'auto', color: '#b45309', fontSize: 12, fontWeight: 700 }}>
                  ✅ Printed
                </span>
              )}
              {kitchenSelected && !kitchenDone && (
                <span style={{
                  marginLeft: 'auto', background: '#d97706', color: '#fff',
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                }}>
                  SELECTED
                </span>
              )}
            </div>

            {/* Kitchen text preview */}
            <div style={{
              background: '#f8fafc', borderRadius: 6, padding: '10px 8px',
              maxHeight: 420, overflow: 'auto',
              border: '1px solid rgba(0,0,0,.07)',
            }}>
              <pre style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: '10px', lineHeight: 1.45, color: '#111',
                margin: 0, whiteSpace: 'pre',
              }}>
                {entry.kitchenText}
              </pre>
            </div>

            {/* Print shortcut at bottom of card */}
            <button
              onClick={e => { e.stopPropagation(); doPrintKitchen() }}
              style={{
                marginTop: 10, width: '100%', border: 'none', borderRadius: 6,
                padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: kitchenDone ? '#b45309' : '#d97706', color: '#fff',
              }}
            >
              {kitchenDone ? '✅ Reprint Kitchen' : '🍳 Print Kitchen Ticket'}
            </button>
          </div>
        )}
      </div>

      {/* ── Selection hint ───────────────────────────────────────────────────── */}
      <p id="hint" style={{
        textAlign: 'center', color: '#64748b', fontSize: 11,
        margin: '12px 16px 0', lineHeight: 1.7, fontFamily: 'sans-serif',
      }}>
        {hasKitchen
          ? <>
              <strong style={{ color: '#94a3b8' }}>Selected for Save .txt:</strong>{' '}
              <span style={{ color: selected === 'cashier' ? '#4ade80' : '#fbbf24', fontWeight: 700 }}>
                {selected === 'cashier' ? '🖨 Cashier Receipt' : '🍳 Kitchen Ticket'}
              </span>
              {' '}— tap the other card to switch.
            </>
          : <span>Tap <strong style={{ color: '#16a34a' }}>Print Cashier Receipt</strong> to print, or <strong>💾 Save .txt</strong> to share via RawBT.</span>
        }
      </p>

      {/* ── Bottom back button ───────────────────────────────────────────────── */}
      <button id="emergencyBack" onClick={doBackToPOS} style={{
        display: 'block', margin: '24px auto 36px', fontSize: 15, padding: '14px 32px',
        border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff',
        fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,.4)',
        fontFamily: 'sans-serif',
      }}>
        ← Done — Back to POS
      </button>
    </>
  )
}
