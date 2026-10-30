# Italy Itinerary

A simple trip planner for Italy using Google Maps.

1. Start typing a **place name** and pick a suggestion: the **address** fills in for you.
   (You can also type the address yourself.)
2. The app finds it on the map, **groups stops by city**, and puts each city's stops in an
   easy order (each next stop is the closest one left).
3. Each city is a **folder**: click its name to open or close it.
4. Click **Open in Google Maps** inside a city to get walking directions for that day.

## Trips

- Your trip is saved in your browser as you go. Type a name and click **Save trip** to name it.
- **+ New trip** starts an empty trip. Your saved trips are listed under **My trips**; click one to open it.
- Everyone who opens the site gets their own trips. Nothing is shared unless you send a link.
- **Share a copy of this trip** copies a link. Whoever opens it gets their own copy to change,
  and their changes don't affect yours.
- Trips stay on the device and browser where you made them. To move one to your phone, share the link
  to yourself.

## Google Maps key

In the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis), create an API key
and turn on **Maps JavaScript API**, **Geocoding API** and **Places API (New)**
(Places gives the suggestions while you type a place name). Then either:

- paste it into `config.js`, or
- paste it into the "Google Maps key" box in the app.

Restrict the key to your Netlify website address (HTTP referrers) so others can't use it.
Without a key, addresses are still found (using OpenStreetMap) and listed, but the map is hidden.

## Deploy on Netlify

Plain HTML/CSS/JS, no build step. In Netlify, use the repo root as the publish directory and
leave the build command empty (or drag this folder into Netlify Drop).
