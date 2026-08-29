const READ_KEY = 'krishichain.notifications.read';

const mins = (n) => new Date(Date.now() - n * 60_000).toISOString();

const SEED = {
  FARMER: [
    [901, 'BID_PLACED', 'New bid on your Aman Rice',
      'Anisur Rahman bid ৳23.00/kg for 4,000 kg on batch #6.', 'HARVEST_BATCH', 6, 12],
    [902, 'STORAGE_PROPOSED', 'Storage offer from Bogura Cold Storage',
      'Unit 2 offered at ৳1.20/kg for a 30-day minimum term. Accept, reject or counter.',
      'STORES', 14, 95],
    [903, 'PAYMENT_RECEIVED', 'Payment received',
      'Anisur Rahman paid ৳92,000.00 against sale order #22.', 'PAYMENT', 31, 260],
    [904, 'TRANSPORT_DELIVERED', 'Order #22 delivered',
      'The consignment reached Sylhet. Payment on delivery is now unlocked.',
      'SALE_ORDER', 22, 300],
    [905, 'BID_PLACED', 'New bid on your Potato batch',
      'Kamrul Traders bid ৳18.50/kg for 1,500 kg on batch #7.', 'HARVEST_BATCH', 7, 1450],
    [906, 'REVIEW_RECEIVED', 'You were rated 5 out of 5',
      'Anisur Rahman reviewed sale order #22: "Grade matched the listing exactly."',
      'SALE_ORDER', 22, 2880],
  ],
  BUYER: [
    [911, 'BID_OUTBID', 'You have been outbid',
      'Your ৳22.00/kg on batch #7 was beaten. The standing bid is now ৳23.50/kg.',
      'BID', 41, 8],
    [912, 'BID_WON', 'You won batch #6',
      'Sale order #22 was created for 4,000 kg of Aman Rice at ৳23.00/kg.',
      'SALE_ORDER', 22, 70],
    [913, 'STORAGE_COUNTERED', 'Warehouse countered your storage request',
      'Bogura Cold Storage countered at ৳1.35/kg. You can accept or reject — not counter again.',
      'STORES', 15, 190],
    [914, 'TRANSPORT_ASSIGNED', 'A driver has taken order #22',
      'Vehicle DHK-METRO-TA-1123 is collecting from Bogura.', 'SALE_ORDER', 22, 420],
    [915, 'STORAGE_FEE_DUE', 'Storage fee outstanding',
      '৳4,800.00 is owed on allocation #15. The unit stays held until it clears.',
      'STORES', 15, 1600],
    [916, 'BID_OUTBID', 'You have been outbid',
      'Your ৳17.90/kg on batch #3 was beaten by ৳18.20/kg.', 'BID', 29, 3100],
  ],
  STORAGE_MANAGER: [
    [921, 'STORAGE_REQUESTED', 'Abdul Karim requested storage',
      '2,000 kg of Aman Rice, asking for unit 2 from 20 Aug.', 'STORES', 16, 25],
    [922, 'STORAGE_ACCEPTED', 'Your proposal was accepted',
      'Anisur Rahman accepted ৳1.35/kg on allocation #15. The unit is now ACTIVE.',
      'STORES', 15, 210],
    [923, 'RELEASE_REQUESTED', 'Early release requested',
      'Allocation #12 is 6 days short of its minimum term. Your approval is needed.',
      'STORES', 12, 640],
    [924, 'STORAGE_FEE_PAID', 'Fee settled on allocation #11',
      '৳3,150.00 received from Kamrul Traders.', 'STORES', 11, 1500],
    [925, 'UNIT_NEAR_CAPACITY', 'Unit 1 is 94% full',
      'Bogura Cold Storage unit 1 is close to capacity. Consider routing new stock elsewhere.',
      'WAREHOUSE', 1, 2600],
  ],
  TRANSPORT_PERSONNEL: [
    [931, 'TRANSPORT_AVAILABLE', 'New trip available',
      'Bogura to Sylhet, 4,000 kg. Needs a vehicle rated 4 tonnes or more.',
      'TRANSPORT_REQUEST', 18, 18],
    [932, 'TRANSPORT_ASSIGNED', 'You claimed trip #17',
      'Pickup from Rangpur, delivery to Dhaka. Marked IN_TRANSIT.',
      'TRANSPORT_REQUEST', 17, 520],
    [933, 'TRANSPORT_DELIVERED', 'Trip #16 closed',
      'Delivery confirmed and the buyer’s payment has been released.',
      'TRANSPORT_REQUEST', 16, 2300],
  ],
  ADMIN: [
    [941, 'COMPLAINT_RAISED', 'New complaint on order #22',
      'Anisur Rahman reported a quality mismatch. Nobody has picked it up yet.',
      'COMPLAINT', 7, 40],
    [942, 'COMPLAINT_RAISED', 'New complaint on order #19',
      'Late delivery reported by Kamrul Traders.', 'COMPLAINT', 8, 330],
    [943, 'PRICE_STALE', 'No bazar record for Karwan Bazar today',
      'The last figure is from 2 days ago. Log today’s price to keep the comparison honest.',
      'PHYSICAL_BAZAR', 1, 700],
    [944, 'USER_REGISTERED', 'A new buyer registered',
      'Shahin Enterprise signed up and is awaiting nothing — the account is already ACTIVE.',
      'USERS', 26, 1900],
  ],
};

const SEEDED_READ = [905, 906, 915, 916, 924, 925, 933, 943, 944];

function readSet() {
  try {
    const stored = localStorage.getItem(READ_KEY);
    if (stored === null) return new Set(SEEDED_READ);
    return new Set(JSON.parse(stored));
  } catch {
    return new Set(SEEDED_READ);
  }
}

function writeSet(set) {
  localStorage.setItem(READ_KEY, JSON.stringify([...set]));
}

function build(role) {
  const read = readSet();
  return (SEED[role] || []).map(
    ([notificationId, type, title, message, relatedEntityType, relatedEntityId, ago]) => ({
      notificationId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      isRead: read.has(notificationId) ? 'Y' : 'N',
      createdAt: mins(ago),
    })
  );
}

export async function listNotifications(role, { unreadOnly = false, limit = 30 } = {}) {
  const rows = build(role)
    .filter((n) => (unreadOnly ? n.isRead === 'N' : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return rows.slice(0, limit);
}

export async function countUnread(role) {
  return build(role).filter((n) => n.isRead === 'N').length;
}

export async function markRead(id) {
  const read = readSet();
  read.add(id);
  writeSet(read);
  return { ok: true };
}

export async function markAllRead(role) {
  const read = readSet();
  (SEED[role] || []).forEach(([id]) => read.add(id));
  writeSet(read);
  return { ok: true };
}
