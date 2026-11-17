// Secret words for Imposter: 10 categories x 40 words, each split into sub-categories.
// With the hint on, the Imposter sees the category AND the sub-category of the secret word
// (chess -> "Sports › Indoor games"). Category index + 1 is the host setting (0 = mixed, any category).
const RAW = [
  { name: 'Transport', groups: {
    'Air transport': ['airplane', 'helicopter', 'glider', 'fighter jet', 'hot air balloon', 'seaplane', 'airship', 'rocket', 'paraglider', 'private jet'],
    'Water transport': ['cargo ship', 'ferry', 'submarine', 'yacht', 'speedboat', 'canoe', 'kayak', 'cruise ship', 'sailboat', 'fishing boat', 'raft', 'jet ski'],
    'Land transport': ['train', 'bus', 'bicycle', 'motorcycle', 'truck', 'electric scooter', 'car', 'auto rickshaw', 'taxi', 'tram', 'metro', 'ambulance', 'fire truck', 'tractor', 'jeep', 'bullock cart', 'van', 'cable car'],
  } },
  { name: 'Electronic gadgets', groups: {
    'Personal tech': ['smartphone', 'tablet', 'smartwatch', 'laptop', 'e-reader', 'power bank', 'fitness band', 'wireless mouse', 'keyboard', 'USB drive', 'phone charger', 'external hard drive', 'desktop computer', 'calculator'],
    'Entertainment tech': ['television', 'gaming console', 'VR headset', 'wireless earbuds', 'portable speaker', 'headphones', 'projector', 'smart speaker', 'soundbar', 'DVD player', 'radio', 'game controller', 'streaming stick'],
    'Work & camera tech': ['digital camera', 'drone', 'drawing tablet', 'microphone', 'webcam', 'printer', 'scanner', 'action camera', 'ring light', 'dashcam', 'Wi-Fi router', 'voice recorder', 'security camera'],
  } },
  { name: 'Accessories', groups: {
    'Things you wear': ['wristwatch', 'sunglasses', 'belt', 'scarf', 'tie', 'gloves', 'cap', 'sun hat', 'socks', 'hair clip', 'headband', 'bow tie', 'suspenders', 'beanie', 'shawl', 'face mask'],
    'Bags & wallets': ['backpack', 'handbag', 'wallet', 'briefcase', 'tote bag', 'sling bag', 'clutch', 'suitcase', 'duffel bag', 'laptop bag', 'pouch', 'coin purse'],
    'Jewellery': ['ring', 'necklace', 'bracelet', 'earrings', 'cufflinks', 'anklet', 'nose ring', 'bangle', 'pendant', 'gold chain', 'brooch', 'tiara'],
  } },
  { name: 'Animals', groups: {
    'Mammals': ['lion', 'elephant', 'dog', 'bear', 'kangaroo', 'tiger', 'giraffe', 'monkey', 'zebra', 'horse', 'camel', 'rabbit'],
    'Birds': ['eagle', 'penguin', 'owl', 'flamingo', 'parrot', 'peacock', 'ostrich', 'crow', 'swan', 'woodpecker'],
    'Reptiles & amphibians': ['crocodile', 'frog', 'sea turtle', 'chameleon', 'cobra', 'lizard', 'tortoise', 'salamander'],
    'Sea animals': ['octopus', 'shark', 'jellyfish', 'starfish', 'dolphin', 'whale', 'seahorse', 'crab', 'lobster', 'clownfish'],
  } },
  { name: 'Jobs', groups: {
    'Healthcare jobs': ['doctor', 'nurse', 'pharmacist', 'physiotherapist', 'dentist', 'surgeon', 'paramedic', 'vet', 'lab technician', 'psychologist'],
    'Office jobs': ['software engineer', 'data analyst', 'project manager', 'accountant', 'HR manager', 'banker', 'lawyer', 'receptionist', 'salesperson', 'CEO'],
    'Creative & trade jobs': ['graphic designer', 'chef', 'electrician', 'plumber', 'carpenter', 'photographer', 'tailor', 'barber', 'painter', 'mechanic'],
    'Public service jobs': ['teacher', 'firefighter', 'police officer', 'pilot', 'postman', 'soldier', 'judge', 'bus driver', 'librarian', 'lifeguard'],
  } },
  { name: 'Things at home', groups: {
    'Furniture': ['sofa', 'dining table', 'bed', 'wardrobe', 'bookshelf', 'armchair', 'coffee table', 'study desk', 'chair', 'shoe rack', 'dressing table', 'bunk bed', 'stool', 'TV stand'],
    'Decor & comfort': ['curtain', 'rug', 'pillow', 'mirror', 'vase', 'wall art', 'cushion', 'photo frame', 'candle', 'doormat', 'bedsheet', 'table lamp', 'indoor plant'],
    'Everyday basics': ['blanket', 'clothes hanger', 'laundry basket', 'wall clock', 'broom', 'mop', 'bucket', 'dustbin', 'toothbrush', 'towel', 'umbrella', 'key', 'spoon'],
  } },
  { name: 'Places', groups: {
    'Places in town': ['library', 'hospital', 'school', 'museum', 'supermarket', 'cafe', 'cinema', 'bank', 'temple', 'post office', 'police station', 'gym', 'restaurant', 'shopping mall', 'bakery', 'stadium'],
    'Nature & outings': ['park', 'beach', 'mountain', 'forest', 'national park', 'zoo', 'waterfall', 'lake', 'desert', 'island', 'garden', 'campsite', 'river', 'cave'],
    'Travel stops': ['airport', 'railway station', 'hotel', 'harbour', 'bus stand', 'metro station', 'petrol pump', 'taxi stand', 'ferry terminal', 'resort'],
  } },
  { name: 'Food, snacks & desserts', groups: {
    'Meals': ['pizza', 'pasta', 'sushi', 'salad', 'burger', 'taco', 'biryani', 'dosa', 'fried rice', 'noodles', 'sandwich', 'idli', 'butter chicken', 'parotta', 'soup'],
    'Snacks': ['popcorn', 'potato chips', 'pretzels', 'nuts', 'granola bar', 'samosa', 'french fries', 'nachos', 'cookies', 'bhel puri', 'murukku', 'spring roll', 'pani puri'],
    'Desserts': ['chocolate cake', 'ice cream', 'apple pie', 'macaroons', 'churros', 'gulab jamun', 'donut', 'brownie', 'cupcake', 'jalebi', 'pudding', 'cheesecake'],
  } },
  { name: 'Home appliances', groups: {
    'Kitchen appliances': ['refrigerator', 'microwave', 'dishwasher', 'blender', 'toaster', 'coffee maker', 'mixer grinder', 'induction stove', 'electric kettle', 'rice cooker', 'air fryer', 'oven', 'water purifier', 'sandwich maker', 'kitchen chimney', 'juicer'],
    'Laundry, cleaning & care': ['washing machine', 'clothes dryer', 'vacuum cleaner', 'steam iron', 'robot vacuum', 'garment steamer', 'pressure washer', 'sewing machine', 'lint remover', 'carpet cleaner', 'electric mop', 'hair dryer'],
    'Cooling & heating': ['air conditioner', 'space heater', 'humidifier', 'ceiling fan', 'table fan', 'air cooler', 'dehumidifier', 'air purifier', 'exhaust fan', 'geyser', 'inverter', 'tower fan'],
  } },
  { name: 'Sports', groups: {
    'Water sports': ['swimming', 'surfing', 'diving', 'rowing', 'water polo', 'kayaking', 'sailing', 'water skiing', 'snorkelling', 'rafting'],
    'Winter sports': ['skiing', 'snowboarding', 'ice hockey', 'figure skating', 'curling', 'bobsleigh', 'speed skating', 'ski jumping', 'sledding', 'luge'],
    'Indoor games': ['chess', 'carrom', 'table tennis', 'badminton', 'bowling', 'squash', 'darts', 'billiards', 'boxing', 'gymnastics'],
    'Outdoor games': ['cricket', 'football', 'tennis', 'golf', 'hockey', 'baseball', 'rugby', 'archery', 'cycling', 'kabaddi'],
  } },
];

export const IMPOSTER_CATEGORIES = RAW.map(c => ({
  name: c.name,
  groups: Object.entries(c.groups).map(([name, words]) => ({ name, words })),
  words: Object.values(c.groups).flat(),
}));

/** The sub-category ("Indoor games") a word belongs to within its category. */
export function groupOf(category, word) {
  const cat = IMPOSTER_CATEGORIES.find(c => c.name === category);
  return cat?.groups.find(g => g.words.includes(word))?.name || null;
}
