// PAGING and FILTERS for the list of bills. Pure, so they can be unit tested.

export const PAGE_SIZE = 20;

// Which slice of `total` rows is page `page`.
//   pageWindow(47, 3) -> { page: 3, pages: 3, skip: 40, limit: 20 }
// A page beyond the last one is kept as asked (it just has no rows), so the
// caller can tell the person which pages exist.
export function pageWindow(total, page, size = PAGE_SIZE) {
  return { page, pages: Math.max(1, Math.ceil(total / size)), skip: (page - 1) * size, limit: size };
}

// The MongoDB filter for one trip's bills, narrowed by category and/or person.
// "Person" means any bill the person paid or has a share in. The values are
// plain text (zod has already checked them), never objects, so a request cannot
// smuggle in a MongoDB operator.
export function billFilter(tripId, { category, person } = {}) {
  const filter = { tripId };
  if (category) filter.category = category;
  if (person) filter.$or = [{ paidBy: person }, { 'splits.uid': person }];
  return filter;
}
