import type { Activity, City, Lodging, Slot } from "./types";

// ---------------------------------------------------------------------------
// Seed dataset.
//
// Hand-curated rather than fetched, so the planner has something real to
// reason over offline. Rows are compact tuples expanded by the helpers at the
// bottom of the file — the density of the data matters more than the ceremony
// of writing it out as objects.
//
// To add a city: append a CITY_ROW, then its ACT_ROWS and LODGING_ROWS keys.
// ---------------------------------------------------------------------------

// [id, name, country, lat, lon, dailyBudgetUsd, minNights, blurb]
type CityRow = [string, string, string, number, number, number, number, string];

const CITY_ROWS: CityRow[] = [
  ["tokyo", "Tokyo", "Japan", 35.6762, 139.6503, 85, 4, "Thirteen cities wearing one name — plan by district or lose days to the trains."],
  ["kyoto", "Kyoto", "Japan", 35.0116, 135.7681, 80, 3, "Temple density is absurd; the trick is pairing one hill walk with one quiet garden per day."],
  ["osaka", "Osaka", "Japan", 34.6937, 135.5023, 75, 2, "Japan's kitchen. Short stay, long nights, excellent base for Nara and Himeji."],
  ["seoul", "Seoul", "South Korea", 37.5665, 126.978, 70, 3, "Palaces at dawn, markets at midnight, and a subway that makes both easy."],
  ["bangkok", "Bangkok", "Thailand", 13.7563, 100.5018, 45, 3, "Move by river and skytrain, never by road. Temples early, markets late."],
  ["hanoi", "Hanoi", "Vietnam", 21.0278, 105.8342, 35, 2, "A walking city disguised as a motorbike city — the Old Quarter rewards aimlessness."],
  ["singapore", "Singapore", "Singapore", 1.3521, 103.8198, 90, 2, "Compact enough to over-deliver in 48 hours if you plan around the heat."],
  ["istanbul", "Istanbul", "Türkiye", 41.0082, 28.9784, 50, 3, "Two continents, one ferry ticket. The Historic core is one day; the city is five."],
  ["rome", "Rome", "Italy", 41.9028, 12.4964, 85, 3, "Layered to the point of absurdity. Book the big three ahead or lose mornings to queues."],
  ["florence", "Florence", "Italy", 43.7696, 11.2558, 80, 2, "Walkable end to end in 40 minutes, which is why it punches above its size."],
  ["barcelona", "Barcelona", "Spain", 41.3851, 2.1734, 80, 3, "Gaudí, Gothic alleys and a beach, all reachable on foot or one metro hop."],
  ["lisbon", "Lisbon", "Portugal", 38.7223, -9.1393, 65, 3, "Built on seven hills — cluster by hill or spend the trip climbing the same one twice."],
  ["paris", "Paris", "France", 48.8566, 2.3522, 95, 4, "Arrondissements are the unit of planning; crossing the city twice in a day is a wasted day."],
  ["amsterdam", "Amsterdam", "Netherlands", 52.3676, 4.9041, 90, 2, "Canal rings make distance deceptive — everything is closer than the map suggests."],
  ["berlin", "Berlin", "Germany", 52.52, 13.405, 70, 3, "Spread out and worth it. Pick two districts a day, no more."],
  ["prague", "Prague", "Czechia", 50.0755, 14.4378, 55, 2, "The old core is small and mobbed by 10am; go early, go uphill, come back late."],
  ["london", "London", "UK", 51.5072, -0.1276, 100, 4, "World-class free museums. Budget travel time generously — it is a big city."],
  ["newyork", "New York", "USA", 40.7128, -74.006, 110, 4, "Plan vertically by neighbourhood and the subway does the rest."],
  ["mexicocity", "Mexico City", "Mexico", 19.4326, -99.1332, 50, 3, "Enormous, green, and chronically underrated — Centro, Roma and Coyoacán are three different trips."],
  ["buenosaires", "Buenos Aires", "Argentina", -34.6037, -58.3816, 45, 3, "Late dinners shift the whole day back; lean into it and the evenings get long."],
  ["marrakech", "Marrakech", "Morocco", 31.6295, -7.9811, 45, 2, "The medina is the attraction. Keep afternoons loose and the Atlas a day trip."],
  ["capetown", "Cape Town", "South Africa", -33.9249, 18.4241, 55, 3, "Weather dictates the order — keep Table Mountain flexible and fill around it."],
  ["sydney", "Sydney", "Australia", -33.8688, 151.2093, 95, 3, "Harbour ferries are public transport and the best sightseeing in the city."],
];

// [name, category, hours, neighborhood, slotCode, mustSee, blurb]
// slotCode: m = morning, a = afternoon, e = evening
type ActRow = [string, Activity["category"], number, string, string, 0 | 1, string];

const ACT_ROWS: Record<string, ActRow[]> = {
  tokyo: [
    ["Senso-ji & Nakamise", "landmark", 2.5, "Asakusa", "m", 1, "Go before 8am and it is almost empty."],
    ["teamLab Planets", "museum", 2, "Toyosu", "ma", 1, "Timed entry; book ahead."],
    ["Shibuya Crossing & Sky", "viewpoint", 2, "Shibuya", "ae", 1, "Sunset slot is the one worth queuing for."],
    ["Tsukiji Outer Market", "market", 2, "Tsukiji", "m", 1, "Breakfast crawl, not a sit-down meal."],
    ["Meiji Jingu & Harajuku", "landmark", 3, "Shibuya", "ma", 0, "Forest shrine then Takeshita St chaos."],
    ["Shinjuku Omoide Yokocho", "nightlife", 2.5, "Shinjuku", "e", 1, "Tiny yakitori alleys under the tracks."],
    ["Yanaka old town walk", "neighborhood", 2.5, "Yanaka", "ma", 0, "Pre-war lanes that survived the war."],
    ["Mt Fuji / Hakone day trip", "daytrip", 9, "Out of town", "m", 0, "Only worth it on a clear forecast."],
  ],
  kyoto: [
    ["Fushimi Inari at dawn", "landmark", 2.5, "South Kyoto", "m", 1, "6am gets you the gates to yourself."],
    ["Kinkaku-ji", "landmark", 1.5, "Northwest", "m", 1, "Small site; pair with Ryoan-ji."],
    ["Arashiyama bamboo & Tenryu-ji", "nature", 3.5, "Arashiyama", "ma", 1, "Go early, the grove jams by 10."],
    ["Gion & Pontocho evening", "neighborhood", 2.5, "Gion", "e", 1, "Lantern-lit lanes after dark."],
    ["Nishiki Market", "market", 1.5, "Downtown", "ma", 0, "Kyoto's kitchen, five blocks long."],
    ["Philosopher's Path & Ginkaku-ji", "nature", 3, "Higashiyama", "ma", 0, "Canal walk linking temples."],
    ["Nara day trip", "daytrip", 6, "Out of town", "m", 0, "45 min by rail; deer and Todai-ji."],
  ],
  osaka: [
    ["Dotonbori at night", "nightlife", 2.5, "Namba", "e", 1, "Neon, takoyaki, the Glico sign."],
    ["Osaka Castle & park", "landmark", 2.5, "Castle", "ma", 1, "Museum inside is skippable; grounds are not."],
    ["Kuromon Ichiba Market", "market", 1.5, "Namba", "m", 0, "Standing seafood breakfast."],
    ["Shinsekai & Tsutenkaku", "neighborhood", 2, "Shinsekai", "ae", 0, "Retro-futurist 1950s Osaka."],
    ["Umeda Sky Floating Garden", "viewpoint", 1.5, "Umeda", "e", 0, "Open-air rooftop ring at sunset."],
    ["Himeji Castle day trip", "daytrip", 6, "Out of town", "m", 0, "Japan's best surviving castle."],
  ],
  seoul: [
    ["Gyeongbokgung & changing of guard", "landmark", 2.5, "Jongno", "m", 1, "Free entry in hanbok."],
    ["Bukchon Hanok Village", "neighborhood", 2, "Jongno", "ma", 1, "Residential — keep the noise down."],
    ["Gwangjang Market", "market", 2, "Jongno", "ma", 1, "Bindaetteok and raw beef, cash only."],
    ["Hongdae night", "nightlife", 3, "Hongdae", "e", 1, "Buskers, dive bars, late noodles."],
    ["Bukhansan hike", "nature", 5, "North", "m", 0, "Granite ridge inside the city limits."],
    ["Dongdaemun Design Plaza", "museum", 2, "Dongdaemun", "ae", 0, "Zaha Hadid's silver wave, lit at night."],
    ["DMZ half-day tour", "daytrip", 7, "Out of town", "m", 0, "Must be booked days ahead."],
  ],
  bangkok: [
    ["Grand Palace & Wat Pho", "landmark", 3.5, "Rattanakosin", "m", 1, "Dress code enforced; go at opening."],
    ["Wat Arun by river", "landmark", 1.5, "Thonburi", "ae", 1, "Cross on the 5-baht ferry."],
    ["Chatuchak Weekend Market", "market", 3.5, "Chatuchak", "m", 1, "Weekends only, 15,000 stalls."],
    ["Chinatown food crawl", "food", 3, "Yaowarat", "e", 1, "Street stalls open after dark."],
    ["Jim Thompson House", "museum", 1.5, "Siam", "ma", 0, "Teak house, silk, a disappearance."],
    ["Rooftop at Lebua / Vertigo", "nightlife", 2, "Silom", "e", 0, "Dress code; worth one night."],
    ["Ayutthaya day trip", "daytrip", 8, "Out of town", "m", 0, "Ruined capital, best by train."],
  ],
  hanoi: [
    ["Old Quarter walk & egg coffee", "neighborhood", 3, "Old Quarter", "ma", 1, "No plan needed; just go."],
    ["Hoan Kiem & Ngoc Son temple", "landmark", 1.5, "Old Quarter", "m", 1, "Weekend evenings the roads close."],
    ["Temple of Literature", "landmark", 1.5, "Dong Da", "ma", 1, "Vietnam's first university, 1070."],
    ["Train Street coffee", "neighborhood", 1, "Old Quarter", "ae", 0, "Check the timetable before you sit."],
    ["Bun cha & street food crawl", "food", 2.5, "Old Quarter", "e", 1, "Plastic stools, charcoal grills."],
    ["Ha Long Bay day trip", "daytrip", 11, "Out of town", "m", 0, "Long day; an overnight is better."],
  ],
  singapore: [
    ["Gardens by the Bay & Supertrees", "nature", 3, "Marina Bay", "ae", 1, "Light show at 7.45 and 8.45pm."],
    ["Hawker crawl at Maxwell", "food", 1.5, "Chinatown", "ma", 1, "Michelin-listed stalls under $5."],
    ["Chinatown & Buddha Tooth temple", "neighborhood", 2, "Chinatown", "ma", 0, "Shophouses and incense."],
    ["Kampong Glam & Haji Lane", "neighborhood", 2, "Kampong Glam", "ae", 1, "Sultan Mosque, murals, bars."],
    ["National Gallery", "museum", 2.5, "Civic District", "ma", 0, "Southeast Asian art in two courthouses."],
    ["Singapore Zoo / Night Safari", "nature", 4, "North", "e", 0, "Genuinely among the world's best."],
  ],
  istanbul: [
    ["Hagia Sophia", "landmark", 1.5, "Sultanahmet", "m", 1, "Queues balloon after 9am."],
    ["Blue Mosque & Hippodrome", "landmark", 1.5, "Sultanahmet", "m", 1, "Closed to visitors at prayer times."],
    ["Grand Bazaar & Spice Bazaar", "market", 3, "Fatih", "ma", 1, "Closed Sundays."],
    ["Topkapi Palace & Harem", "museum", 3, "Sultanahmet", "ma", 1, "Harem ticket is separate and worth it."],
    ["Bosphorus ferry to Asia", "viewpoint", 2.5, "Bosphorus", "ae", 1, "Public ferry beats the tourist cruise."],
    ["Karaköy & Galata evening", "nightlife", 3, "Beyoğlu", "e", 0, "Meyhane dinner then rooftop."],
    ["Balat & Fener walk", "neighborhood", 2.5, "Fatih", "ma", 0, "Painted houses, Greek and Jewish history."],
  ],
  rome: [
    ["Colosseum & Roman Forum", "landmark", 3.5, "Ancient Rome", "m", 1, "Timed ticket; forum included."],
    ["Vatican Museums & Sistine", "museum", 3.5, "Vatican", "m", 1, "Book the first slot or go Friday night."],
    ["Pantheon & Piazza Navona", "landmark", 2, "Centro Storico", "ma", 1, "Free but now needs a ticket."],
    ["Trastevere dinner crawl", "food", 3, "Trastevere", "e", 1, "The city's best eating streets."],
    ["Borghese Gallery", "museum", 2, "Villa Borghese", "ma", 0, "Two-hour cap, must reserve."],
    ["Trevi & Spanish Steps early", "landmark", 1.5, "Centro Storico", "m", 0, "7am or not at all."],
    ["Appian Way & catacombs", "daytrip", 4, "South", "ma", 0, "Bike the original road out of Rome."],
  ],
  florence: [
    ["Uffizi Gallery", "museum", 2.5, "Centro", "m", 1, "Reserve; the queue is otherwise brutal."],
    ["Duomo climb & Baptistery", "landmark", 2.5, "Centro", "m", 1, "463 steps, timed entry."],
    ["Accademia (David)", "museum", 1.5, "San Marco", "ma", 1, "45 minutes is genuinely enough."],
    ["Oltrarno & Santo Spirito", "neighborhood", 2.5, "Oltrarno", "ae", 1, "Artisan workshops, fewer crowds."],
    ["Piazzale Michelangelo sunset", "viewpoint", 1.5, "Oltrarno", "e", 1, "Walk up, bus down."],
    ["Mercato Centrale", "market", 1.5, "San Lorenzo", "m", 0, "Ground floor for produce, upstairs to eat."],
    ["Siena & Chianti day trip", "daytrip", 8, "Out of town", "m", 0, "Rent a car or take a tour."],
  ],
  barcelona: [
    ["Sagrada Família", "landmark", 2, "Eixample", "ma", 1, "Book a timed slot weeks out."],
    ["Park Güell", "landmark", 2, "Gràcia", "m", 1, "Monumental zone needs a ticket."],
    ["Gothic Quarter & Cathedral", "neighborhood", 2.5, "Ciutat Vella", "ma", 1, "Get lost deliberately."],
    ["La Boqueria & El Raval", "market", 2, "Ciutat Vella", "m", 0, "Skip the front stalls, go deeper."],
    ["Casa Batlló or La Pedrera", "museum", 1.5, "Eixample", "ae", 0, "Pick one, not both."],
    ["Bunkers del Carmel sunset", "viewpoint", 2, "Gràcia", "e", 1, "Civil war gun emplacement, whole-city view."],
    ["Barceloneta & tapas night", "nightlife", 3, "Barceloneta", "e", 0, "Eat inland from the beachfront."],
  ],
  lisbon: [
    ["Alfama & tram 28", "neighborhood", 3, "Alfama", "m", 1, "Ride it at 8am or stand all day."],
    ["São Jorge Castle", "landmark", 2, "Alfama", "ma", 1, "Best viewpoint in the old city."],
    ["Belém: Mosteiro & pastéis", "landmark", 3.5, "Belém", "m", 1, "Monastery then the original custard tarts."],
    ["Time Out Market", "food", 1.5, "Cais do Sodré", "ae", 0, "Busy but the quality is real."],
    ["Bairro Alto fado & bars", "nightlife", 3, "Bairro Alto", "e", 1, "Small fado houses, book ahead."],
    ["Miradouro crawl", "viewpoint", 2, "Príncipe Real", "ae", 0, "Four terraces, one downhill walk."],
    ["Sintra day trip", "daytrip", 8, "Out of town", "m", 1, "Pena, Quinta da Regaleira; go on the first train."],
  ],
  paris: [
    ["Louvre", "museum", 3.5, "1st", "m", 1, "Enter via Carrousel; Wed/Fri late nights."],
    ["Eiffel Tower & Trocadéro", "landmark", 2.5, "7th", "ae", 1, "Trocadéro for the photo, summit for the view."],
    ["Musée d'Orsay", "museum", 2.5, "7th", "ma", 1, "Impressionists in a train station."],
    ["Notre-Dame & Île de la Cité", "landmark", 2, "4th", "ma", 1, "Reopened; free timed entry."],
    ["Montmartre & Sacré-Cœur", "neighborhood", 3, "18th", "ma", 1, "Go up the back streets, not the funicular."],
    ["Le Marais walk & falafel", "neighborhood", 2.5, "3rd", "ae", 0, "Sunday is the one day it is all open."],
    ["Canal Saint-Martin evening", "nightlife", 2.5, "10th", "e", 0, "Where Parisians actually drink."],
    ["Versailles day trip", "daytrip", 7, "Out of town", "m", 0, "Gardens on a fountain day."],
  ],
  amsterdam: [
    ["Rijksmuseum", "museum", 2.5, "Museumkwartier", "m", 1, "Night Watch at opening, before the tours."],
    ["Anne Frank House", "museum", 1.5, "Centrum", "ma", 1, "Tickets released 6 weeks out and vanish."],
    ["Van Gogh Museum", "museum", 2, "Museumkwartier", "ma", 1, "Next door to the Rijks; pair them."],
    ["Jordaan canal walk", "neighborhood", 2.5, "Jordaan", "ae", 1, "The prettiest grid in the city."],
    ["Canal boat (small electric)", "viewpoint", 1.5, "Centrum", "ae", 0, "Skip the big glass-roof barges."],
    ["De Pijp & Albert Cuyp", "market", 2, "De Pijp", "m", 0, "Market then brown-café lunch."],
    ["Zaanse Schans / Haarlem", "daytrip", 5, "Out of town", "m", 0, "Haarlem is the better half-day."],
  ],
  berlin: [
    ["Brandenburg Gate & Reichstag", "landmark", 2, "Mitte", "ma", 1, "Dome visit is free but needs registering."],
    ["Memorial to the Murdered Jews of Europe", "landmark", 1, "Mitte", "ma", 1, "Underground information centre included."],
    ["East Side Gallery & Wall Memorial", "landmark", 2.5, "Friedrichshain", "ma", 1, "Bernauer Str. is the more honest site."],
    ["Museum Island (Pergamon/Neues)", "museum", 3, "Mitte", "m", 1, "Pergamon partly closed — check first."],
    ["Kreuzberg food & bars", "nightlife", 3, "Kreuzberg", "e", 1, "Turkish, Syrian, late and cheap."],
    ["Tempelhofer Feld", "nature", 2, "Tempelhof", "ae", 0, "Cycle the runways of a dead airport."],
    ["Prenzlauer Berg Sunday market", "market", 2, "Prenzlauer Berg", "m", 0, "Mauerpark flea market and karaoke."],
  ],
  prague: [
    ["Prague Castle & St Vitus", "landmark", 3, "Hradčany", "m", 1, "Largest castle complex in the world."],
    ["Charles Bridge at dawn", "landmark", 1, "Malá Strana", "m", 1, "By 9am it is shoulder to shoulder."],
    ["Old Town Square & Astronomical Clock", "landmark", 1.5, "Staré Město", "ma", 1, "The hourly show is brief; the tower view is not."],
    ["Jewish Quarter & synagogues", "museum", 2.5, "Josefov", "ma", 1, "One combined ticket, six sites."],
    ["Vyšehrad & river walk", "viewpoint", 2.5, "Vyšehrad", "ae", 0, "The fortress locals use as a park."],
    ["Beer hall evening", "nightlife", 2.5, "Nové Město", "e", 0, "Tank beer at U Kunstátu or Lokál."],
  ],
  london: [
    ["British Museum", "museum", 3, "Bloomsbury", "m", 1, "Free; pick three galleries, not thirty."],
    ["Tower of London", "landmark", 3, "Tower Hamlets", "m", 1, "Yeoman tour is included and good."],
    ["Westminster & Churchill War Rooms", "landmark", 3, "Westminster", "ma", 1, "Abbey, Parliament, the bunker."],
    ["Borough Market & South Bank", "market", 2.5, "Southwark", "ma", 1, "Market then the river walk to Tate."],
    ["Tate Modern", "museum", 2, "Southwark", "ae", 0, "Free, and the top-floor view is too."],
    ["Soho & West End show", "nightlife", 4, "Soho", "e", 1, "Day seats if you queue at 10am."],
    ["Greenwich by river", "daytrip", 4, "Greenwich", "ma", 0, "Clipper out, DLR back."],
    ["Hampstead Heath & Kenwood", "nature", 3, "Hampstead", "ma", 0, "Parliament Hill for the skyline."],
  ],
  newyork: [
    ["Met Museum", "museum", 3, "Upper East Side", "m", 1, "Pay-what-you-wish for NY residents only."],
    ["Statue of Liberty & Ellis Island", "landmark", 4, "Harbor", "m", 1, "First ferry or lose two hours."],
    ["High Line & Chelsea Market", "neighborhood", 2.5, "Chelsea", "ma", 1, "Walk north to south, eat at the end."],
    ["Top of the Rock / Edge", "viewpoint", 1.5, "Midtown", "e", 1, "Rock beats Empire — you can see the Empire."],
    ["Brooklyn Bridge & DUMBO", "landmark", 2.5, "Brooklyn", "ae", 1, "Walk Brooklyn-to-Manhattan for the skyline."],
    ["Greenwich Village jazz", "nightlife", 3, "West Village", "e", 0, "Village Vanguard, two sets a night."],
    ["Central Park loop", "nature", 2.5, "Central Park", "ma", 0, "Bethesda, Ramble, Bow Bridge."],
    ["MoMA", "museum", 2.5, "Midtown", "ma", 0, "Free Friday evenings, very busy."],
  ],
  mexicocity: [
    ["Museo Nacional de Antropología", "museum", 3, "Chapultepec", "m", 1, "The best museum in the Americas."],
    ["Centro Histórico & Zócalo", "landmark", 3, "Centro", "m", 1, "Cathedral, Templo Mayor, Bellas Artes."],
    ["Teotihuacán", "daytrip", 6, "Out of town", "m", 1, "Go at opening, before the heat."],
    ["Coyoacán & Frida Kahlo Museum", "museum", 3.5, "Coyoacán", "ma", 1, "Casa Azul tickets online only."],
    ["Roma & Condesa food walk", "food", 3, "Roma", "e", 1, "Taquerías, mezcal, late."],
    ["Xochimilco trajineras", "nature", 4, "South", "ma", 0, "Go with a group or it is a quiet boat."],
    ["Mercado de la Merced", "market", 2, "Centro", "m", 0, "Enormous; go with cash and no bag."],
  ],
  buenosaires: [
    ["Recoleta Cemetery", "landmark", 1.5, "Recoleta", "ma", 1, "Evita, and a city of mausoleums."],
    ["San Telmo Sunday fair", "market", 3, "San Telmo", "m", 1, "Sundays only; antiques and tango."],
    ["La Boca & Caminito", "neighborhood", 2, "La Boca", "ma", 0, "Daylight only; stay on the main streets."],
    ["Teatro Colón tour", "museum", 1.5, "Centro", "ma", 1, "One of the world's great opera houses."],
    ["Palermo Soho dinner & bars", "nightlife", 4, "Palermo", "e", 1, "Nothing starts before 9.30pm."],
    ["Milonga (social tango)", "nightlife", 3, "San Telmo", "e", 1, "A class then the floor; not a show."],
    ["Tigre Delta day trip", "daytrip", 6, "Out of town", "m", 0, "Train then a launch through the delta."],
  ],
  marrakech: [
    ["Jemaa el-Fnaa at night", "market", 2.5, "Medina", "e", 1, "Food stalls appear at dusk."],
    ["Souks & Medina walk", "market", 3, "Medina", "ma", 1, "Agree prices before anything is wrapped."],
    ["Bahia Palace", "landmark", 1.5, "Medina", "ma", 1, "Zellij and cedar at its peak."],
    ["Jardin Majorelle & YSL", "museum", 2, "Gueliz", "m", 1, "Timed tickets, go at opening."],
    ["Le Jardin Secret & rooftops", "viewpoint", 1.5, "Medina", "ae", 0, "Mint tea above the noise."],
    ["Hammam & rest", "neighborhood", 2, "Medina", "ae", 0, "Build this into the hottest afternoon."],
    ["Atlas Mountains / Ourika", "daytrip", 8, "Out of town", "m", 0, "Berber villages and waterfalls."],
  ],
  capetown: [
    ["Table Mountain", "nature", 4, "City Bowl", "m", 1, "Cable car; cancel-prone, keep it flexible."],
    ["Robben Island", "museum", 4, "Waterfront", "m", 1, "Ferry sells out; weather can cancel."],
    ["Cape Point & Boulders penguins", "daytrip", 8, "Peninsula", "m", 1, "Full day, hire a car."],
    ["Bo-Kaap walk", "neighborhood", 1.5, "Bo-Kaap", "ma", 1, "Cape Malay history, not just paint."],
    ["Kirstenbosch Gardens", "nature", 2.5, "Southern Suburbs", "ma", 0, "Boomslang canopy walk."],
    ["V&A Waterfront & Zeitz MOCAA", "museum", 3, "Waterfront", "ae", 0, "Grain silo cut into an atrium."],
    ["Winelands: Stellenbosch", "daytrip", 7, "Out of town", "m", 0, "Use a driver if you are tasting."],
  ],
  sydney: [
    ["Opera House & Circular Quay", "landmark", 2, "CBD", "ma", 1, "Interior tour is worth the ticket."],
    ["Harbour Bridge walk & Rocks", "landmark", 2.5, "The Rocks", "ma", 1, "Pylon lookout is cheap and high."],
    ["Bondi to Coogee coastal walk", "nature", 3.5, "Eastern Beaches", "m", 1, "6km of cliffs and beaches."],
    ["Manly ferry", "viewpoint", 3, "Harbour", "ae", 1, "Best-value harbour cruise in the city."],
    ["Royal Botanic Garden & Mrs Macquarie", "nature", 2, "CBD", "ma", 0, "The classic Opera House view."],
    ["Surry Hills food & bars", "food", 3, "Surry Hills", "e", 1, "Small bars, no pokies."],
    ["Blue Mountains day trip", "daytrip", 9, "Out of town", "m", 0, "Train to Katoomba, walk the Three Sisters."],
  ],
};

// [name, kind, nightlyUsd, neighborhood, rating, perks (| separated), why]
type LodgeRow = [string, Lodging["kind"], number, string, number, string, string];

const LODGING_ROWS: Record<string, LodgeRow[]> = {
  tokyo: [
    ["Unplan Kagurazaka", "hostel", 42, "Shinjuku", 4.6, "Pod beds|Cafe bar|Luggage store", "Quiet backstreet base two stops from Shinjuku's night food."],
    ["Hotel Graphy Nezu", "hotel", 95, "Yanaka", 4.5, "Kitchen|Rooftop|Laundry", "Puts the old-town walks on your doorstep and Ueno one stop away."],
    ["Trunk Hotel Yoyogi", "boutique", 310, "Shibuya", 4.7, "Park views|Design bar|Spa", "Walk to Shibuya and Harajuku without touching a train."],
  ],
  kyoto: [
    ["Piece Hostel Sanjo", "hostel", 38, "Downtown", 4.5, "Rooftop|Breakfast|Bike hire", "Central enough to reach Gion on foot and Fushimi by one train."],
    ["Hotel Ethnography Gion", "hotel", 140, "Gion", 4.4, "Machiya rooms|Tea service", "Being inside Gion is what buys you the empty 6am temple shots."],
    ["Nazuna Kyoto Gosho", "boutique", 290, "Imperial Palace", 4.8, "Private onsen|Courtyard", "Restored machiya with a bath you will want after a 20k-step day."],
  ],
  osaka: [
    ["The Blend Inn", "hostel", 34, "Bentencho", 4.5, "Design dorms|Cafe", "Cheap, calm, and eight minutes from Namba's noise."],
    ["Hotel Noum Osaka", "hotel", 105, "Tanimachi", 4.6, "Lounge|Bike hire", "Walking distance to the castle, one hop to Dotonbori."],
    ["Zentis Osaka", "boutique", 230, "Umeda", 4.7, "Shinkansen access|Bar", "Best base if Himeji or Nara day trips are in the plan."],
  ],
  seoul: [
    ["Bunk Guesthouse Hongdae", "hostel", 30, "Hongdae", 4.4, "Rooftop|Bar|Breakfast", "You will be out late in Hongdae; sleep where you drink."],
    ["Nostalgia Hotel", "hotel", 85, "Jongno", 4.5, "Hanok-style|Palace walk", "Five minutes from Gyeongbokgung's 10am guard change."],
    ["Fourseason Hanok Stay", "boutique", 190, "Bukchon", 4.8, "Courtyard|Private hanok", "Staying in Bukchon means seeing it before the tour buses."],
  ],
  bangkok: [
    ["Lub d Siam", "hostel", 24, "Siam", 4.5, "Pool|BTS access|Bar", "On the skytrain, which is the only sane way to move here."],
    ["Riva Surya", "hotel", 95, "Rattanakosin", 4.6, "Riverside|Pool|Boat pier", "Private pier puts the Grand Palace and Wat Arun minutes away."],
    ["The Siam", "boutique", 480, "Dusit", 4.9, "River villas|Spa|Private boat", "Art-deco riverside splurge with its own shuttle boat."],
  ],
  hanoi: [
    ["Hanoi La Siesta Hostel", "hostel", 18, "Old Quarter", 4.6, "Breakfast|Tours|Laundry", "Inside the Old Quarter, which is the whole point of Hanoi."],
    ["La Siesta Premium Hang Be", "hotel", 75, "Old Quarter", 4.8, "Rooftop pool|Spa", "Rooftop to recover on after the motorbike chaos."],
    ["Capella Hanoi", "boutique", 310, "French Quarter", 4.9, "Opera theme|Bar|Spa", "Ten-minute walk to the lake, far quieter at night."],
  ],
  singapore: [
    ["CUBE Boutique Capsule Chinatown", "hostel", 40, "Chinatown", 4.4, "Capsules|MRT|Hawker nearby", "Maxwell hawker centre is a three-minute walk."],
    ["Hotel Mono", "hotel", 130, "Chinatown", 4.4, "Shophouse|Monochrome design", "Walkable to Chinatown, Marina Bay two MRT stops away."],
    ["Parkroyal Collection Pickering", "boutique", 260, "Chinatown", 4.7, "Sky gardens|Infinity pool", "The garden-city thesis, built. Pool matters in this heat."],
  ],
  istanbul: [
    ["Cheers Lighthouse", "hostel", 26, "Sultanahmet", 4.5, "Terrace views|Breakfast", "Walk to Hagia Sophia before the queues form."],
    ["Hotel Ibrahim Pasha", "hotel", 115, "Sultanahmet", 4.7, "Roof terrace|Breakfast", "Blue Mosque out the window, Grand Bazaar 10 minutes on foot."],
    ["Georges Hotel Galata", "boutique", 210, "Beyoğlu", 4.7, "Rooftop restaurant|Views", "Better for nightlife; ferry down to the old city each morning."],
  ],
  rome: [
    ["The RomeHello", "hostel", 40, "Monti", 4.6, "Garden|Bar|Design dorms", "Monti is walkable to the Colosseum and actually has locals."],
    ["Hotel Santa Maria", "hotel", 165, "Trastevere", 4.6, "Courtyard|Breakfast|Bikes", "Trastevere dinners without a night-time taxi."],
    ["Hotel de Russie", "boutique", 690, "Centro Storico", 4.8, "Secret garden|Spa", "Between the Spanish Steps and Piazza del Popolo."],
  ],
  florence: [
    ["Plus Florence", "hostel", 38, "San Lorenzo", 4.2, "Rooftop pool|Bar", "Ten minutes from the Duomo, cheap in an expensive city."],
    ["Hotel Pendini", "hotel", 140, "Centro", 4.5, "Piazza views|Breakfast", "On Piazza della Repubblica — everything is a 10-minute walk."],
    ["Palazzo Vecchietti", "boutique", 330, "Centro", 4.8, "Suites|Renaissance palazzo", "Walk home from Oltrarno dinners across the Ponte Vecchio."],
  ],
  barcelona: [
    ["Casa Gracia", "hostel", 42, "Gràcia", 4.5, "Terrace|Breakfast|Events", "Top of Passeig de Gràcia: Gaudí one way, Gràcia bars the other."],
    ["Hotel Banys Orientals", "hotel", 130, "Ciutat Vella", 4.5, "Gothic quarter|Design rooms", "Inside the Gothic maze, which is where you want to be at night."],
    ["Yurbban Trafalgar", "boutique", 195, "Born", 4.7, "Rooftop pool|Bikes", "Born and the Gothic Quarter on foot, Sagrada two metro stops."],
  ],
  lisbon: [
    ["Home Lisbon Hostel", "hostel", 32, "Baixa", 4.8, "Family dinner|Bar", "Mid-hill, so you climb once not four times a day."],
    ["Santiago de Alfama", "hotel", 180, "Alfama", 4.7, "Boutique|Restaurant", "Alfama at 7am without a tram ride is worth the premium."],
    ["Memmo Príncipe Real", "boutique", 280, "Príncipe Real", 4.8, "Pool|City views|Bar", "Best viewpoint-crawl base and a short walk to Bairro Alto."],
  ],
  paris: [
    ["Generator Paris", "hostel", 48, "10th", 4.3, "Rooftop bar|Canal nearby", "Canal Saint-Martin evenings and two metro lines at the door."],
    ["Hôtel Fabric", "hotel", 210, "11th", 4.7, "Loft design|Breakfast", "Marais on foot, Oberkampf bars at night, cheaper than the 1st."],
    ["Hôtel Le Pigalle", "boutique", 290, "18th", 4.6, "Record players|Bistro", "Montmartre above you, the big museums 15 minutes by metro."],
  ],
  amsterdam: [
    ["ClinkNOORD", "hostel", 45, "Noord", 4.4, "Free ferry|Bar|Breakfast", "Free ferry runs all night; 5 minutes to Centraal."],
    ["Hotel V Nesplein", "hotel", 195, "Centrum", 4.6, "Design|Cafe|Central", "Equidistant from the Rijks and the Jordaan canals."],
    ["Pulitzer Amsterdam", "boutique", 390, "Jordaan", 4.8, "25 canal houses|Bar|Garden", "Twenty-five linked canal houses in the Jordaan itself."],
  ],
  berlin: [
    ["EastSeven Berlin", "hostel", 34, "Prenzlauer Berg", 4.7, "Garden|Kitchen|Small", "Calm base, tram straight into Mitte."],
    ["Hotel Oderberger", "hotel", 125, "Prenzlauer Berg", 4.7, "Historic pool|Breakfast", "Swim in a restored 1902 bathhouse after a 20km day."],
    ["Michelberger Hotel", "boutique", 160, "Friedrichshain", 4.5, "Courtyard|Bar|Restaurant", "Opposite the East Side Gallery, Kreuzberg over the bridge."],
  ],
  prague: [
    ["Sophie's Hostel", "hostel", 28, "Nové Město", 4.6, "Design dorms|Bar", "Fifteen minutes to Charles Bridge, away from the stag parties."],
    ["Hotel Golden Key", "hotel", 110, "Hradčany", 4.6, "Castle district|Historic", "Inside the castle complex — you beat every tour bus."],
    ["Mandarin Oriental Prague", "boutique", 390, "Malá Strana", 4.8, "Monastery building|Spa", "Quiet side of the river, two minutes from the bridge."],
  ],
  london: [
    ["Wombat's City Hostel London", "hostel", 42, "Tower Hamlets", 4.4, "Bar|Kitchen|Central", "Next to the Tower and Liverpool St for everywhere else."],
    ["The Hoxton Shoreditch", "hotel", 185, "Shoreditch", 4.5, "Lobby workspace|Breakfast bag", "East London nights, City and South Bank walkable."],
    ["The Zetter Townhouse", "boutique", 265, "Clerkenwell", 4.7, "Cocktail parlour|Quirky rooms", "Between the City and Bloomsbury's free museums."],
  ],
  newyork: [
    ["HI NYC Hostel", "hostel", 70, "Upper West Side", 4.2, "Garden|Kitchen|Subway", "Express trains downtown and Central Park at the corner."],
    ["Pod 51", "hotel", 165, "Midtown East", 4.1, "Compact rooms|Rooftop", "Cheap-for-Manhattan and central to Midtown's viewpoints."],
    ["The Hoxton Williamsburg", "boutique", 290, "Brooklyn", 4.6, "Rooftop pool|Skyline views", "Skyline views and the L train into Manhattan in 12 minutes."],
  ],
  mexicocity: [
    ["Casa Pepe", "hostel", 30, "Centro", 4.6, "Rooftop bar|Breakfast", "Centro Histórico sights are all within 15 minutes on foot."],
    ["Hotel Milan Roma", "hotel", 80, "Roma", 4.4, "Roma Norte|Walkable", "Roma Norte puts the best eating within three blocks."],
    ["Casa Polanco", "boutique", 320, "Polanco", 4.8, "1940s mansion|Garden", "Walk to the Anthropology Museum and Chapultepec."],
  ],
  buenosaires: [
    ["America del Sur Hostel", "hostel", 26, "San Telmo", 4.6, "Deck|Asado nights", "San Telmo's milongas and Sunday fair at the door."],
    ["Mio Buenos Aires", "hotel", 120, "Recoleta", 4.5, "Wine cellar|Design", "Recoleta Cemetery and Palermo's dinners both close."],
    ["Legado Mitico", "boutique", 180, "Palermo", 4.8, "Themed rooms|Library", "Palermo Soho on foot, which matters when dinner ends at 1am."],
  ],
  marrakech: [
    ["Rodamon Riad Marrakech", "hostel", 30, "Medina", 4.6, "Pool|Riad courtyard|Rooftop", "A riad bed in the medina for hostel money."],
    ["Riad Yasmine", "hotel", 140, "Medina", 4.6, "Famous pool|Rooftop breakfast", "Five minutes from the souks, a courtyard to hide in at 3pm."],
    ["El Fenn", "boutique", 340, "Medina", 4.8, "Rooftop bar|Art|Pools", "Best rooftop in the city, two minutes from Jemaa el-Fnaa."],
  ],
  capetown: [
    ["Never at Home Green Point", "hostel", 28, "Green Point", 4.5, "Pool|Bar|Promenade", "Walk the promenade; Waterfront ferries 15 minutes away."],
    ["The Backyard Hotel", "hotel", 95, "Woodstock", 4.5, "Courtyard|Pool|Bikes", "Close to Woodstock's markets, 10 minutes to the City Bowl."],
    ["Gorgeous George", "boutique", 230, "City Bowl", 4.7, "Rooftop pool|Restaurant", "City Bowl base so a clear Table Mountain morning is seizable."],
  ],
  sydney: [
    ["Sydney Harbour YHA", "hostel", 55, "The Rocks", 4.6, "Rooftop|Opera House view|Kitchen", "A rooftop view of the Opera House, for hostel money."],
    ["Establishment Hotel", "hotel", 230, "CBD", 4.6, "Bars downstairs|Central", "Ferries, the bridge and Surry Hills all within a walk."],
    ["Ovolo Woolloomooloo", "boutique", 280, "Woolloomooloo", 4.7, "Wharf building|Free minibar", "On a finger wharf, 20 minutes' walk from Circular Quay."],
  ],
};

// ---------------------------------------------------------------------------
// Opening days
//
// Keyed by city then exact activity name — more robust than guessing at
// generated slugs. 0 = Sunday. Only closures that realistically wreck a day
// are listed; everything else is treated as open daily.
// ---------------------------------------------------------------------------

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const EXCEPT = (...closed: number[]) => ALL_DAYS.filter((d) => !closed.includes(d));

const WEEKDAY_LIMITS: Record<string, Record<string, number[]>> = {
  bangkok: { "Chatuchak Weekend Market": [6, 0] },
  buenosaires: { "San Telmo Sunday fair": [0] },
  berlin: {
    "Prenzlauer Berg Sunday market": [0],
    "Museum Island (Pergamon/Neues)": EXCEPT(1),
  },
  istanbul: { "Grand Bazaar & Spice Bazaar": EXCEPT(0) },
  rome: {
    "Vatican Museums & Sistine": EXCEPT(0),
    "Borghese Gallery": EXCEPT(1),
  },
  florence: {
    "Uffizi Gallery": EXCEPT(1),
    "Accademia (David)": EXCEPT(1),
  },
  paris: {
    Louvre: EXCEPT(2),
    "Musée d'Orsay": EXCEPT(1),
  },
  newyork: { "Met Museum": EXCEPT(3) },
  mexicocity: { "Coyoacán & Frida Kahlo Museum": EXCEPT(1) },
  prague: { "Jewish Quarter & synagogues": EXCEPT(6) },
  amsterdam: { "De Pijp & Albert Cuyp": EXCEPT(0) },
};

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function parseSlots(code: string): Slot[] {
  const out: Slot[] = [];
  if (code.includes("m")) out.push("morning");
  if (code.includes("a")) out.push("afternoon");
  if (code.includes("e")) out.push("evening");
  return out.length > 0 ? out : ["morning", "afternoon"];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const CITIES: City[] = CITY_ROWS.map(
  ([id, name, country, lat, lon, dailyBudgetUsd, minNights, blurb]) => ({
    id,
    name,
    country,
    lat,
    lon,
    dailyBudgetUsd,
    minNights,
    blurb,
  }),
);

export const ACTIVITIES: Activity[] = Object.entries(ACT_ROWS).flatMap(
  ([cityId, rows]) =>
    rows.map(([name, category, hours, neighborhood, slotCode, mustSee, blurb]) => ({
      id: `${cityId}-${slug(name)}`,
      cityId,
      name,
      category,
      hours,
      neighborhood,
      bestSlots: parseSlots(slotCode),
      weekdays: WEEKDAY_LIMITS[cityId]?.[name],
      mustSee: mustSee === 1,
      blurb,
    })),
);

export const LODGINGS: Lodging[] = Object.entries(LODGING_ROWS).flatMap(
  ([cityId, rows]) =>
    rows.map(([name, kind, nightlyUsd, neighborhood, rating, perks, why]) => ({
      id: `${cityId}-${slug(name)}`,
      cityId,
      name,
      kind,
      nightlyUsd,
      neighborhood,
      rating,
      perks: perks.split("|"),
      why,
    })),
);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const cityById = new Map(CITIES.map((c) => [c.id, c]));
const activitiesByCity = new Map<string, Activity[]>();
for (const a of ACTIVITIES) {
  const list = activitiesByCity.get(a.cityId);
  if (list) list.push(a);
  else activitiesByCity.set(a.cityId, [a]);
}
const lodgingByCity = new Map<string, Lodging[]>();
for (const l of LODGINGS) {
  const list = lodgingByCity.get(l.cityId);
  if (list) list.push(l);
  else lodgingByCity.set(l.cityId, [l]);
}
const activityById = new Map(ACTIVITIES.map((a) => [a.id, a]));

export function getCity(id: string): City | undefined {
  return cityById.get(id);
}

/** Throws on unknown ids — callers inside the planner have validated input. */
export function requireCity(id: string): City {
  const city = cityById.get(id);
  if (!city) throw new Error(`Unknown city: ${id}`);
  return city;
}

export function getActivities(cityId: string): Activity[] {
  return activitiesByCity.get(cityId) ?? [];
}

export function getActivity(id: string): Activity | undefined {
  return activityById.get(id);
}

export function getLodging(cityId: string): Lodging[] {
  return lodgingByCity.get(cityId) ?? [];
}

export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return CITIES;
  return CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
  );
}
