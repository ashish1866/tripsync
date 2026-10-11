// Role names and what each one may do, worded the same on every screen.
export const ROLE_LABEL = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export const ROLE_CAN = {
  owner: 'Runs the trip: invites people, changes roles, edits the dates and budget.',
  editor: 'Adds and changes stops, bills and packing items.',
  viewer: 'Sees the plan, map, weather and money, but changes nothing.',
};

// The same, said to the person who will have the role (on the invite page).
export const ROLE_YOU = {
  editor: 'you can add and change stops, bills and packing items.',
  viewer: 'you can see the plan, map, weather and money, but not change them.',
};

export const canPlan = (role) => role === 'owner' || role === 'editor';
