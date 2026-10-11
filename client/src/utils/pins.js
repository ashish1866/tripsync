import { placeLine } from './format';

// Map pins for a trip: the destination (the "0" stone) plus every stop that
// has a place. Locations stay [lng, lat] here; TripMap converts them.
//
// selectedDay: on the day plan, that day's stops carry their number in the day,
//   and stops on other days are faded and unlabelled.
// Without it (the overview), each stop carries its day number.
export function tripPins(trip, { selectedDay } = {}) {
  const pins = [
    { id: 'destination', kind: 'destination', location: trip.destination.location, label: '0', title: placeLine(trip.destination) },
  ];
  for (const day of trip.days) {
    day.activities.forEach((stop, i) => {
      if (!stop.place) return;
      const onThisDay = selectedDay === undefined || selectedDay === day.dayNumber;
      pins.push({
        id: stop.id,
        kind: 'stop',
        location: stop.place.location,
        label: selectedDay === undefined ? String(day.dayNumber) : onThisDay ? String(i + 1) : '',
        faded: !onThisDay,
        title: selectedDay === day.dayNumber ? `Stop ${i + 1}: ${stop.title}` : `Day ${day.dayNumber}: ${stop.title}`,
        dayNumber: day.dayNumber,
      });
    });
  }
  return pins;
}
