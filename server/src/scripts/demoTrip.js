import { buildDays, addDays, datesBetween } from '../utils/dates.js';
import { newItemId } from '../utils/ids.js';
import { equalSplit } from '../utils/money.js';

// THE MANALI DEMO TRIP: what the seed script loads for the viva.
// Pure: it builds the documents and touches no database, so it can be unit tested.
//
// Four friends, four days, Rs 45,000 for the group. Ashish is the real account
// that runs the seed (the owner). Rahul and Ankit are editors, Rohan is a viewer.
// The three friends are demo profiles: they appear in the group, in bills and in
// settle up, but have no Firebase login (they are flagged demo: true).
//
// Places are real (coordinates from Geoapify/OpenStreetMap). Bills are the kind a
// group really splits: the hotel, the Volvo bus, cabs, paragliding, food.
// Money is whole paise (Rs 8,000 = 800000).

export const DEMO_TAG = 'manali-demo';
export const DEMO_DAYS = 4;
export const DEMO_BUDGET = 4_500_000; // Rs 45,000
const rs = (rupees) => rupees * 100;

export const FRIENDS = [
  { key: 'rahul', uid: 'demo-rahul', name: 'Rahul', role: 'editor' },
  { key: 'ankit', uid: 'demo-ankit', name: 'Ankit', role: 'editor' },
  { key: 'rohan', uid: 'demo-rohan', name: 'Rohan', role: 'viewer' },
];

const MANALI = { name: 'Manali', state: 'Himachal Pradesh', country: 'India', location: [77.17481, 32.2574] };

// Real places: name, address, [lng, lat].
const place = (name, address, lng, lat) => ({ name, address, location: [lng, lat], placeId: '' });
const OLD_MANALI = place('Old Manali', 'Old Manali, Manali, Himachal Pradesh, India', 77.1761, 32.2571);
const CHIRAGS = place("Chirag's Kitchen", 'Manu Mandir Street, Old Manali - 175131, Himachal Pradesh, India', 77.176145, 32.2571963);
const HADIMBA = place('Hadimba Devi Temple', 'Hadimba Road, Bhajogi, Manali - 175131, HP, India', 77.1808391, 32.2484443);
const MALL_ROAD = place('The Mall Road', 'Manali - 175131, HP, India', 77.1895578, 32.2444268);
const TEAPOT = place('The yellow teapot', 'Peddler Street, Old Manali - 175131, Himachal Pradesh, India', 77.1770052, 32.2556332);
const SOLANG = place('Solang Valley', 'Solang, Manali, India', 77.1560266, 32.3173957);
const MANU = place('Manu Temple', 'Manu Mandir Street, Old Manali - 175131, HP, India', 77.1760411, 32.2570128);
const JOGINI = place('Lower Jogini Falls', 'Bahang - 175103, HP, India', 77.1880097, 32.2751982);
const SPRINGS = place('Hot Water', 'Vashist Road, Vashisht - 175131, HP, India', 77.1880135, 32.2656023);
const MONASTERY = place('Tibetan Monastery', 'Mathiana Trail, Koshla, Manali - 175131, HP, India', 77.1911595, 32.2540506);

// Stops per day, in time order (a stop with no time or no place is allowed on purpose).
const STOPS = [
  [
    { title: 'Check in at the hotel', time: '12:00', place: OLD_MANALI, notes: 'Hotel is in Old Manali. Ask for the room key before lunch.' },
    { title: "Lunch at Chirag's Kitchen", time: '13:30', place: CHIRAGS, notes: '' },
    { title: 'Hadimba Devi Temple', time: '16:00', place: HADIMBA, notes: 'Shoes off at the gate. The deodar forest behind it is worth the walk.' },
    { title: 'Walk on Mall Road', time: '18:30', place: MALL_ROAD, notes: 'Dinner here. Cash and UPI both work.' },
  ],
  [
    { title: 'Breakfast at The yellow teapot', time: '08:30', place: TEAPOT, notes: '' },
    { title: 'Solang Valley', time: '10:00', place: SOLANG, notes: 'Paragliding if the wind is calm. Carry jackets and a photo ID.' },
    { title: 'Evening at Manu Temple', time: '17:00', place: MANU, notes: '' },
  ],
  [
    { title: 'Jogini Falls', time: '09:30', place: JOGINI, notes: 'Easy walk from Vashisht. Wear shoes with grip.' },
    { title: 'Vashisht hot springs', time: '13:00', place: SPRINGS, notes: '' },
    { title: 'Tibetan Monastery', time: '16:30', place: MONASTERY, notes: '' },
  ],
  [
    { title: 'Pack and check out', time: '11:00', place: null, notes: 'Hand back the room key. Leave the bags at the hotel desk.' },
    { title: 'Volvo to Delhi', time: '18:00', place: null, notes: 'Seats are booked for four. Be at the stand by 17:30.' },
  ],
];

// The packing list: [text, packed by (friend key or "ashish")]. null = not packed yet.
const PACKING = [
  ['Warm jackets', 'ashish'],
  ['Power bank', 'rahul'],
  ['Rain cover', null],
  ['Trekking shoes', 'ankit'],
  ['Sunscreen and lip balm', null],
  ['Medicines and ORS', 'ashish'],
  ['Photo ID for paragliding', null],
  ['Cash, ATMs are few in the hills', 'rahul'],
];

// Bills. day is relative to the first day of the trip (negative = booked before it).
// who: 'all' = the four of them; or a list of keys. paidBy / addedBy are keys ('ashish' is the owner).
// Rohan is a viewer, so the owner records the bills he paid.
const BILLS = [
  { title: 'Hotel in Old Manali, 3 nights', rupees: 9600, category: 'stay', paidBy: 'ashish', day: -10, split: 'all' },
  { title: 'Volvo Delhi to Manali, 4 seats', rupees: 5600, category: 'travel', paidBy: 'ankit', day: -12, split: 'all' },
  { title: 'Volvo Manali to Delhi, 4 seats', rupees: 5600, category: 'travel', paidBy: 'ankit', day: -12, split: 'all' },
  { title: 'First-aid kit and medicines', rupees: 520, category: 'other', paidBy: 'ashish', day: -2, split: 'all' },
  { title: "Lunch at Chirag's Kitchen", rupees: 1860, category: 'food', paidBy: 'ashish', day: 0, split: 'all' },
  { title: 'Dinner on Mall Road, three of us', rupees: 1250, category: 'food', paidBy: 'rohan', addedBy: 'ashish', day: 0, split: ['ashish', 'rahul', 'rohan'] },
  { title: 'Breakfast at The yellow teapot', rupees: 1120, category: 'food', paidBy: 'ankit', day: 1, split: 'all' },
  { title: 'Cab to Solang Valley and back', rupees: 2400, category: 'travel', paidBy: 'rahul', day: 1, split: 'all' },
  { title: 'Paragliding at Solang, three of us', rupees: 7500, category: 'activities', paidBy: 'rahul', day: 1, split: { ashish: 2500, rahul: 2500, ankit: 2500 } },
  { title: 'Cab to Vashisht and Jogini Falls', rupees: 900, category: 'travel', paidBy: 'rahul', day: 2, split: 'all' },
  { title: 'Tickets at Jogini Falls and the springs', rupees: 400, category: 'activities', paidBy: 'rahul', day: 2, split: 'all' },
  { title: 'Woollen caps and gloves', rupees: 1800, category: 'shopping', paidBy: 'ashish', day: 2, split: ['ashish', 'rahul', 'ankit'] },
  { title: 'Dinner at an Old Manali cafe', rupees: 2480, category: 'food', paidBy: 'ashish', day: 2, split: 'all' },
  { title: 'Snacks for the bus', rupees: 640, category: 'food', paidBy: 'rohan', addedBy: 'ashish', day: 3, split: 'all' },
];

// One payment already marked as paid, to show "Mark as paid" in the bills.
const PAYMENT = { from: 'rohan', to: 'ashish', rupees: 1000, day: 3 };

// The documents to insert.
//   owner: { uid, name } the real account that owns the trip
//   startDate: "YYYY-MM-DD", the first day
//   tripId: the id the trip will have (the bills point at it)
//   now: a Date, used for created/joined times
export function buildDemo({ owner, startDate, tripId, now = new Date() }) {
  const endDate = addDays(startDate, DEMO_DAYS - 1);
  const uidOf = { ashish: owner.uid, ...Object.fromEntries(FRIENDS.map((f) => [f.key, f.uid])) };
  const dayDate = (n) => addDays(startDate, n);
  const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000);

  // Demo profiles for the three friends (no Firebase login).
  const users = FRIENDS.map((f) => ({
    firebaseUid: f.uid,
    name: f.name,
    email: `demo.${f.key}@example.com`,
    createdAt: at(60 * 24 * 14),
    demo: true,
  }));

  const members = [
    { uid: owner.uid, role: 'owner', joinedAt: at(60 * 24 * 14) },
    ...FRIENDS.map((f, i) => ({ uid: f.uid, role: f.role, joinedAt: at(60 * 24 * (13 - i)) })),
  ];

  // Days with their stops.
  const days = buildDays(startDate, endDate).map((day, i) => ({
    ...day,
    activities: STOPS[i].map((s, n) => ({
      id: newItemId(),
      title: s.title,
      time: s.time,
      notes: s.notes,
      place: s.place,
      addedBy: n % 2 === 0 ? owner.uid : FRIENDS[0].uid,
      createdAt: at(60 * 24 * 12),
      updatedAt: at(60 * 24 * 12),
      updatedBy: n % 2 === 0 ? owner.uid : FRIENDS[0].uid,
    })),
  }));

  // The packing list.
  const checklist = PACKING.map(([text, packedBy], n) => ({
    id: newItemId(),
    text,
    done: packedBy !== null,
    addedBy: owner.uid,
    createdAt: at(60 * 24 * 6 - n),
    doneBy: packedBy ? uidOf[packedBy] : null,
    doneAt: packedBy ? at(60 * 24 * 2 - n) : null,
  }));

  const trip = {
    _id: tripId,
    name: 'Manali Trip',
    destination: MANALI,
    startDate,
    endDate,
    budget: DEMO_BUDGET,
    owner: owner.uid,
    members,
    days,
    checklist,
    seed: DEMO_TAG,
    createdAt: at(60 * 24 * 14),
    updatedAt: at(60),
  };

  // Bills, then the payment.
  const everyone = [owner.uid, ...FRIENDS.map((f) => f.uid)];
  const expenses = BILLS.map((b, n) => {
    const amount = rs(b.rupees);
    let splitType = 'equal';
    let splits;
    if (b.split === 'all') splits = equalSplit(amount, everyone);
    else if (Array.isArray(b.split)) splits = equalSplit(amount, b.split.map((k) => uidOf[k]));
    else {
      splitType = 'exact';
      splits = Object.entries(b.split).map(([k, r]) => ({ uid: uidOf[k], share: rs(r) }));
    }
    return {
      tripId,
      title: b.title,
      amount,
      category: b.category,
      paidBy: uidOf[b.paidBy],
      date: dayDate(b.day),
      type: 'expense',
      splitType,
      splits,
      createdBy: uidOf[b.addedBy ?? b.paidBy],
      createdAt: at(60 * 24 * 5 - n * 30),
      updatedAt: at(60 * 24 * 5 - n * 30),
    };
  });
  expenses.push({
    tripId,
    title: `${nameOf(PAYMENT.from, owner)} paid ${nameOf(PAYMENT.to, owner)}`,
    amount: rs(PAYMENT.rupees),
    category: 'settlement',
    paidBy: uidOf[PAYMENT.from],
    date: dayDate(PAYMENT.day),
    type: 'settlement',
    splitType: 'exact',
    splits: [{ uid: uidOf[PAYMENT.to], share: rs(PAYMENT.rupees) }],
    createdBy: uidOf.ashish,
    createdAt: at(30),
    updatedAt: at(30),
  });

  return { users, trip, expenses, dates: datesBetween(startDate, endDate) };
}

function nameOf(key, owner) {
  return key === 'ashish' ? owner.name : FRIENDS.find((f) => f.key === key).name;
}
