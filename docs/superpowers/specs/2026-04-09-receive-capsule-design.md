# Receive Capsule — Shareable Link Design

## Overview

Give receivers an intuitive, link-based experience for claiming their time capsules. Instead of manually entering a Capsule ID, receivers open a shareable URL that auto-loads the capsule details and guides them through claiming.

## Route

```
/receive/:founderAddress/:capsuleId
```

Example: `http://localhost:5173/receive/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/0`

## UX Flow

1. Receiver opens the shared link
2. Page loads with capsule data from URL params (no manual entry needed)
3. **Auto-verify** connected wallet:
   - If wallet = beneficiary → show unlockable capsule
   - If wallet ≠ beneficiary → show "not for you" state
   - If no wallet connected → prompt to connect, then re-verify

## Page States

### State 1 — Not Yet Unlocked
- Shows capsule details (founder address, ETH amount)
- Shows encrypted message preview (still locked)
- Live countdown timer to unlock (updates every second)
- Claim button disabled with "Locked" styling

### State 2 — Unlocked
- Green success banner "Time Capsule Unlocked!"
- Full decrypted message displayed
- ETH amount prominently shown
- Claim button enabled (green, prominent)

### State 3 — Wallet Mismatch
- Shows capsule details (founder, ETH amount)
- Clearly states "This capsule is not for you"
- Shows connected wallet vs beneficiary address
- No claim button

### State 4 — No Wallet
- Centered wallet connect prompt
- Brief explanation of what to expect after connecting

## Components

- `ReceiveCapsule.tsx` — new page component
- `CountdownTimer.tsx` — live countdown using `setInterval` (1s ticks)
- WalletConnect reused from existing component

## Countdown Timer

- Updates every second via `setInterval`
- Displays: `XXd XXh XXm XXs`
- When reaches 0: auto-switches to State 2, auto-decrypts message

## Decryption Flow

On unlock (State 1 → State 2):
1. Call `decryptStoredMessage(beneficiary, unlockTimestamp, messageHash)` from `lib/ipfs.ts`
2. Display decrypted message in the message box
3. Enable Claim ETH button

## Files Modified

- `frontend/src/App.tsx` — add route `/receive/:founder/:capsuleId`
- `frontend/src/pages/ReceiveCapsule.tsx` — new page (uses WalletConnect, CountdownTimer, decryptStoredMessage)

## Files Created

- `frontend/src/pages/ReceiveCapsule.tsx`
- `frontend/src/components/CountdownTimer.tsx`
