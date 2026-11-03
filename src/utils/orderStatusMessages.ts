/**
 * Order-status helpers shared by the customer order tracking screens.
 *
 * Messages are derived from the ACTUAL ordered items and the persisted order
 * status. Nothing here assumes a specific product (e.g. dosa) up front.
 */

export type NormalizedOrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINEIN' | 'UNKNOWN';

/** Normalize persisted order_type ("DINE_IN", "Take Away", "delivery" ...). */
export function normalizeOrderType(raw?: string | null): NormalizedOrderType {
  const v = String(raw || '').toUpperCase().replace(/[\s_-]/g, '');
  if (v === 'DELIVERY') return 'DELIVERY';
  if (v === 'TAKEAWAY') return 'TAKEAWAY';
  if (v === 'DINEIN') return 'DINEIN';
  return 'UNKNOWN';
}

type DishKind = 'idly' | 'dosa' | 'other';

function dishKind(name?: string | null): DishKind {
  const n = String(name || '').toLowerCase();
  if (/\bidl(y|i|ies)\b/.test(n)) return 'idly';
  if (/\bdos(a|ai|as|e)\b/.test(n)) return 'dosa';
  return 'other';
}

function activeItems(items: any[]): any[] {
  return (items || []).filter(
    (it) => it && it.name && (it.status || '').toUpperCase() !== 'CANCELLED',
  );
}

/** Message shown while the kitchen is cooking, based on what was ordered. */
export function getCookingMessage(items: any[]): { title: string; sub: string } {
  const list = activeItems(items);
  const generic = { title: 'Your order is being freshly prepared.', sub: 'Our kitchen is working on it' };
  if (list.length === 0) return generic;

  const distinctNames = Array.from(new Set(list.map((i) => String(i.name).trim().toLowerCase())));
  if (distinctNames.length === 1) {
    const name = String(list[0].name).trim();
    return { title: `Your ${name} is being prepared.`, sub: 'Freshly made for you' };
  }

  const kinds = Array.from(new Set(list.map((i) => dishKind(i.name))));
  if (kinds.length === 1 && kinds[0] === 'dosa') {
    return { title: 'Your dosa is being prepared.', sub: 'Freshly made for you' };
  }
  if (kinds.length === 1 && kinds[0] === 'idly') {
    return { title: 'Your idly is being prepared.', sub: 'Freshly made for you' };
  }
  return generic;
}

/** Banner text for a kitchen status (PENDING/CONFIRMED/PREPARING/ALMOST_READY/READY...). */
export function getKitchenBanner(
  status: string,
  items: any[],
  orderType: NormalizedOrderType,
): { title: string; sub: string } {
  const s = (status || '').toUpperCase();
  const pickup = orderType === 'TAKEAWAY'
    ? 'Please collect it at the counter'
    : orderType === 'DELIVERY'
      ? 'Handing over for delivery'
      : 'It will be served shortly';

  if (s === 'CANCELLED') return { title: 'Order Cancelled', sub: 'This order will not be prepared' };
  if (s === 'PENDING') return { title: 'Order Received!', sub: 'Waiting for kitchen to accept' };
  if (s === 'CONFIRMED') return { title: 'Kitchen has received your order', sub: 'Getting ingredients ready' };
  if (s === 'PREPARING') return getCookingMessage(items);
  if (s === 'ALMOST_READY') return { title: 'Almost done!', sub: 'Adding the final touches' };
  if (s === 'READY' || s === 'SERVED' || s === 'COMPLETED') {
    return { title: 'Your food is ready!', sub: pickup };
  }
  return { title: 'Your order is being freshly prepared.', sub: 'Our kitchen is working on it' };
}

/** Kitchen progression level 1..5 (Received, Kitchen, Cooking, Almost Ready, Ready). */
export function getKitchenLevel(status: string): number {
  const s = (status || '').toUpperCase();
  if (s === 'PENDING') return 1;
  if (s === 'CONFIRMED') return 2;
  if (s === 'PREPARING') return 3;
  if (s === 'ALMOST_READY') return 4;
  if (['READY', 'SERVED', 'COMPLETED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP'].includes(s)) return 5;
  return 1;
}

/**
 * Per-dish status derived from the KOT preparation stage and persisted item status.
 *
 * When the kitchen (KOT) is preparing:
 * - Dishes show "Cooking (80%)" / "Prep" or their specific stage
 * - Completed/ready dishes show "Ready" (100%)
 * - When KOT is Ready or Out for Delivery, dishes show "Ready" (100%)
 */
export function getDishProgress(item: any, orderLevel: number, kotStatus?: string) {
  const raw = (item?.status || '').toUpperCase();
  const ks = (kotStatus || '').toUpperCase();

  // If item itself has an explicit terminal status
  if (raw === 'READY' || raw === 'SERVED' || raw === 'COMPLETED') {
    return { label: 'Ready', pct: '100%', color: '#00A01D', sub: 'Ready for packaging', done: true };
  }
  if (raw === 'CANCELLED') {
    return { label: 'Cancelled', pct: '0%', color: '#94a3b8', sub: 'Cancelled', done: false };
  }

  // If KOT / Kitchen as a whole is ready, served, out for delivery, or completed
  if (['READY', 'SERVED', 'COMPLETED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP'].includes(ks) || orderLevel >= 5) {
    return { label: 'Ready', pct: '100%', color: '#00A01D', sub: 'Cooked & packed', done: true };
  }

  // If KOT / Kitchen is in Almost Ready phase
  if (ks === 'ALMOST_READY' || orderLevel === 4) {
    return { label: 'Almost Ready (90%)', pct: '90%', color: '#FF3400', sub: 'Final garnish & packing', done: false };
  }

  // If KOT / Kitchen is in Cooking/Preparing phase
  if (ks === 'PREPARING' || raw === 'PREPARING' || raw === 'COOKING' || orderLevel === 3) {
    const itemName = (item?.name || '').toLowerCase();
    const isGriddle = itemName.includes('dosa') || itemName.includes('dosai') || itemName.includes('oothappam') || itemName.includes('roast');
    const isSteamed = itemName.includes('idli') || itemName.includes('idly') || itemName.includes('vada') || itemName.includes('vadai');
    const sub = isGriddle
      ? 'On the griddle - crisping up'
      : isSteamed
      ? 'Steaming fresh in the kitchen'
      : 'In the kitchen - being freshly prepared';

    return { label: 'Cooking (80%)', pct: '80%', color: '#FF3400', sub, done: false };
  }

  // If KOT / Kitchen is Confirmed
  if (ks === 'CONFIRMED' || raw === 'CONFIRMED' || orderLevel === 2) {
    return { label: 'Prep (30%)', pct: '30%', color: '#FF3400', sub: 'Ingredients being assembled', done: false };
  }

  // Received / Pending
  return { label: 'Pending', pct: '10%', color: '#94a3b8', sub: 'Waiting in kitchen queue', done: false };
}

export interface UnifiedDeliveryStage {
  stepIndex: number; // 1: Order Confirmed, 2: Preparing in Kitchen, 3: Out for Delivery, 4: Delivered
  statusText: string;
  bannerTitle: string;
  bannerSub: string;
}

/**
 * Unified single progression based on KOT kitchen status and delivery partner status.
 *
 * Steps:
 * 1. Order Confirmed (KOT Received/Confirmed)
 * 2. Cooking / Kitchen (KOT Preparing/Almost Ready/Ready)
 * 3. Out for Delivery (Rider picked up / on the way)
 * 4. Delivered
 */
export function getUnifiedDeliveryStage(
  kotStatus: string | null | undefined,
  deliveryStatus: string | null | undefined,
  items: any[] = []
): UnifiedDeliveryStage {
  const ks = (kotStatus || '').toUpperCase();
  const ds = (deliveryStatus || '').toUpperCase();

  if (ks === 'CANCELLED' || ds === 'CANCELLED') {
    return {
      stepIndex: -1,
      statusText: 'Order Cancelled',
      bannerTitle: 'Order Cancelled',
      bannerSub: 'This order was cancelled and will not be prepared.',
    };
  }

  if (ds === 'DELIVERED') {
    return {
      stepIndex: 4,
      statusText: 'Delivered',
      bannerTitle: 'Order Delivered!',
      bannerSub: 'Enjoy your hot, fresh meal!',
    };
  }

  if (
    ds === 'OUT_FOR_DELIVERY' ||
    ds === 'PICKED_UP' ||
    ds === 'RIDER_ARRIVED'
  ) {
    return {
      stepIndex: 3,
      statusText: 'Out for Delivery',
      bannerTitle: 'Your order is on the way!',
      bannerSub: 'Your food has left the kitchen and is en route with your delivery partner.',
    };
  }

  if (
    ks === 'PREPARING' ||
    ks === 'ALMOST_READY' ||
    ks === 'READY' ||
    ks === 'SERVED' ||
    ks === 'COMPLETED' ||
    ds === 'PREPARING' ||
    ds === 'READY'
  ) {
    const cookingMsg = getCookingMessage(items);
    const title = ks === 'READY' || ks === 'COMPLETED' 
      ? 'Your food is ready!' 
      : ks === 'ALMOST_READY' 
      ? 'Almost done!' 
      : cookingMsg.title;
    const sub = ks === 'READY' || ks === 'COMPLETED'
      ? 'Packed and waiting for delivery partner pickup.'
      : ks === 'ALMOST_READY'
      ? 'Adding final touches and packing.'
      : cookingMsg.sub;

    return {
      stepIndex: 2,
      statusText: 'Preparing',
      bannerTitle: title,
      bannerSub: sub,
    };
  }

  return {
    stepIndex: 1,
    statusText: 'Order Confirmed',
    bannerTitle: 'Kitchen has received your order',
    bannerSub: 'Getting ingredients ready to cook.',
  };
}
