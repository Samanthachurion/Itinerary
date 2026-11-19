# Italy Itinerary

A simple trip planner for Italy using Google Maps.

1. Start typing a **place name** and pick a suggestion: the **address** fills in for you.
   (You can also type the address yourself.)
2. The app finds it on the map, **groups stops by city**, and puts each city's stops in an
   easy order (each next stop is the closest one left).
3. Click **Open in Google Maps** next to a city to get walking directions for that day.

Stops are saved in your browser.

## Import a Google Maps list

1. Open your saved list in Google Maps and scroll to the bottom so every place loads.
2. Select the whole list, copy it, and paste it into **Import a Google Maps list** in the app.
3. Click **Import places**. Each place is found and added as a stop, with any notes you wrote in Google Maps.

Places already in your trip are skipped, so you can import again after your list changes.
Places the app can't find are listed so you can add them by hand. With a Google Maps key that
has the **Places API (New)** turned on, places are found with Google; otherwise a free search is used.

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
