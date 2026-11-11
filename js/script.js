// Find our date picker inputs on the page
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');

// Call the setupDateInputs function from dateRange.js
// This sets up the date pickers to:
// - Default to a range of 9 days (from 9 days ago to today)
// - Restrict dates to NASA's image archive (starting from 1995)
setupDateInputs(startInput, endInput);

// ---------------------------------------------
// Settings
// ---------------------------------------------

// Your NASA API key. Get a free one at https://api.nasa.gov
// (DEMO_KEY works too, but it only allows a few requests per hour.)
const API_KEY = 'zLfbTMjbLp6hMkhfb6JnpzLL9fMTtDmtwq6dDPJk';
const API_URL = 'https://api.nasa.gov/planetary/apod';

// Backup: in September 2026 NASA moved APOD to science.nasa.gov.
// Since then, the API above often returns a placeholder (the NASA logo,
// titled "NASA Science") instead of the real photos. When that happens,
// we load the photos from NASA's new APOD feed, which needs no key.
const BACKUP_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';

// ---------------------------------------------
// Find the elements we need on the page
// ---------------------------------------------
const getImagesButton = document.getElementById('getImagesBtn');
const gallery = document.getElementById('gallery');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const modalCloseButton = document.getElementById('modalClose');
const factText = document.getElementById('factText');

// ---------------------------------------------
// LevelUp: Random "Did You Know?" space fact
// ---------------------------------------------
const spaceFacts = [
  'One day on Venus is longer than one year on Venus.',
  'Neutron stars are so dense that a teaspoon of one would weigh about a billion tons on Earth.',
  'There are more stars in the universe than grains of sand on all of Earth\'s beaches.',
  'The footprints left on the Moon by Apollo astronauts could last for millions of years.',
  'Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.',
  'Jupiter\'s Great Red Spot is a storm larger than Earth that has raged for centuries.',
  'Saturn is less dense than water. In a big enough bathtub, it would float!',
  'The International Space Station orbits Earth about every 90 minutes.',
  'Olympus Mons on Mars is the tallest volcano in the solar system, about 2.5 times taller than Mount Everest.',
  'The Hubble Space Telescope has made more than 1.5 million observations since 1990.'
];

// Pick a random fact and show it when the page loads
const randomIndex = Math.floor(Math.random() * spaceFacts.length);
factText.textContent = spaceFacts[randomIndex];

// We save the cleaned-up data here so the modal can use it later
let apodItems = [];

// ---------------------------------------------
// Fetch the APOD data for the selected dates
// ---------------------------------------------
async function getSpaceImages() {
  const startDate = startInput.value;
  const endDate = endInput.value;

  // Show a loading message while we wait for NASA
  gallery.innerHTML = `
    <div class="message">
      <div class="message-icon">🔄</div>
      <p>Loading space photos…</p>
    </div>
  `;

  // Disable the button so the user doesn't click it many times
  getImagesButton.disabled = true;

  try {
    // Step 1: try NASA's API with our API key
    let items = await fetchWithApiKey(startDate, endDate);

    // Step 2: if that didn't give us real photos, use the backup feed
    if (!items) {
      console.log('NASA API returned placeholder data. Using the backup feed instead.');
      items = await fetchFromBackup(startDate, endDate);
    }

    if (items.length === 0) {
      throw new Error('No photos were found for those dates.');
    }

    apodItems = items;
    displayGallery(apodItems);
  } catch (error) {
    console.error('Error fetching APOD data:', error);

    // PWA: when offline, the service worker only has dates you've already loaded
    const hint = navigator.onLine
      ? 'Tip: today\'s photo may not be posted yet. Try an earlier start date.'
      : 'You\'re offline. Only date ranges you viewed while online are saved. Try one of those, or reconnect.';

    gallery.innerHTML = `
      <div class="message">
        <div class="message-icon">${navigator.onLine ? '⚠️' : '📡'}</div>
        <p>Could not load space photos. ${navigator.onLine ? error.message : ''}</p>
        <p class="message-hint">${hint}</p>
      </div>
    `;
  } finally {
    // Turn the button back on, whether it worked or not
    getImagesButton.disabled = false;
  }
}

// ---------------------------------------------
// Fetch from NASA's API using the API key
// Returns the list of photos, or null if NASA sent placeholder data or failed
// ---------------------------------------------
async function fetchWithApiKey(startDate, endDate) {
  const url = `${API_URL}?api_key=${API_KEY}&start_date=${startDate}&end_date=${endDate}&thumbs=true`;

  try {
    // Stop waiting after 8 seconds (the old API can be very slow) and use the backup
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      // For example: 403 = bad key, 429 = too many requests
      console.warn(`NASA API responded with status ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Placeholder check: the real photos are never all titled "NASA Science"
    const isPlaceholder = data.some((item) => item.title === 'NASA Science' || (item.url || '').includes('nasa-logo'));
    if (isPlaceholder) {
      return null;
    }

    // Newest first, then turn each entry into our simple format
    return data.reverse().map((item) => ({
      date: item.date,
      title: item.title,
      explanation: item.explanation,
      mediaType: item.media_type,
      imageUrl: item.media_type === 'image' ? item.url : item.thumbnail_url || '',
      fullImageUrl: item.hdurl || item.url,
      videoUrl: item.media_type === 'video' ? item.url : '',
      pageUrl: `https://apod.nasa.gov/apod/ap${toShortDate(item.date)}.html`
    }));
  } catch (error) {
    console.warn('NASA API request failed:', error);
    return null;
  }
}

// ---------------------------------------------
// Fetch from NASA's new APOD feed (no key needed)
// ---------------------------------------------
async function fetchFromBackup(startDate, endDate) {
  // This feed wants dates as YYMMDD (for example 2026-11-07 → 261107)
  const dateFrom = toShortDate(startDate);
  const dateTo = toShortDate(endDate);
  const url = `${BACKUP_URL}?date_from=${dateFrom}&date_to=${dateTo}&per_page=25`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NASA responded with status ${response.status}.`);
  }

  const data = await response.json();
  return data.map(cleanUpItem);
}

// ---------------------------------------------
// Clean up one entry from the backup feed
// ---------------------------------------------
function cleanUpItem(item) {
  // Title and explanation can contain HTML tags, so we keep only the text
  const title = stripHtml(item.title);
  const explanation = stripHtml(item.explanation).replace(/^Explanation:\s*/, '');

  // LevelUp: videos. NASA puts the YouTube/Vimeo player link inside basic_html.
  let videoUrl = '';
  if (item.media_type === 'video') {
    videoUrl = findVideoUrl(item.basic_html);
  }

  return {
    date: item.date,
    title: title,
    explanation: explanation,
    mediaType: item.media_type,
    // hdurl is the image. For videos it's only a generic thumbnail, so we skip it.
    imageUrl: item.media_type === 'image' ? item.hdurl : getVideoThumbnail(videoUrl),
    fullImageUrl: item.hdurl,
    videoUrl: videoUrl,
    // url is a link to the full article on NASA's website
    pageUrl: item.url
  };
}

// ---------------------------------------------
// Build the gallery cards from the data
// ---------------------------------------------
function displayGallery(items) {
  // Clear out the loading message
  gallery.innerHTML = '';

  items.forEach((item, index) => {
    const isVideo = item.mediaType === 'video';

    // If there's no picture to show (some videos), show an icon instead
    const mediaHtml = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="" loading="lazy" />`
      : `<div class="no-image">🎬</div>`;

    const badgeHtml = isVideo ? `<span class="video-badge">▶ Video</span>` : '';

    // Create the card
    const card = document.createElement('div');
    card.classList.add('gallery-item');
    card.setAttribute('tabindex', '0'); // lets keyboard users focus it
    card.innerHTML = `
      <div class="image-wrapper">
        ${mediaHtml}
        ${badgeHtml}
      </div>
      <p class="item-title"></p>
      <p class="item-date">${formatDate(item.date)}</p>
    `;

    // Using textContent for the title keeps any odd characters from breaking the page
    card.querySelector('.item-title').textContent = item.title;
    const image = card.querySelector('img');
    if (image) {
      image.alt = item.title;
    }

    // Open the modal when the card is clicked (or Enter is pressed)
    card.addEventListener('click', () => openModal(index));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        openModal(index);
      }
    });

    gallery.appendChild(card);
  });
}

// ---------------------------------------------
// Modal: show the large image, title, date, explanation
// ---------------------------------------------
function openModal(index) {
  const item = apodItems[index];
  let mediaHtml = '';

  if (item.mediaType === 'image') {
    mediaHtml = `<img src="${item.fullImageUrl}" alt="" />`;
  } else if (item.videoUrl && isEmbeddable(item.videoUrl)) {
    // LevelUp: embed the video right in the modal
    // referrerpolicy lets YouTube know which site is showing the video (it requires this)
    mediaHtml = `
      <div class="video-wrapper">
        <iframe src="${item.videoUrl}" title="APOD video"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
      </div>
      <a class="video-link" href="${item.pageUrl}" target="_blank" rel="noopener">
        ▶ Watch on NASA's site
      </a>
    `;
  } else {
    // Other media: give a clear link to NASA's page
    mediaHtml = `
      <a class="video-link" href="${item.pageUrl}" target="_blank" rel="noopener">
        ▶ View this on NASA's site
      </a>
    `;
  }

  modalContent.innerHTML = `
    ${mediaHtml}
    <h2 id="modalTitle"></h2>
    <p class="modal-date">${formatDate(item.date)}</p>
    <p class="modal-explanation"></p>
  `;

  // Add the text with textContent so it shows exactly as written
  modalContent.querySelector('#modalTitle').textContent = item.title;
  modalContent.querySelector('.modal-explanation').textContent = item.explanation;
  const image = modalContent.querySelector('img');
  if (image) {
    image.alt = item.title;
  }

  modal.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeModal() {
  modal.classList.remove('open');
  document.body.classList.remove('no-scroll');
  // Clearing the content stops any video that is playing
  modalContent.innerHTML = '';
}

// ---------------------------------------------
// Helper functions
// ---------------------------------------------

// Check if a video link can be shown inside an iframe
function isEmbeddable(url) {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com');
}

// Turn "2026-11-07" into "261107" (the format NASA's new feed uses)
function toShortDate(dateString) {
  return dateString.slice(2).replaceAll('-', '');
}

// Remove HTML tags and keep only the text
function stripHtml(html) {
  // DOMParser reads the HTML safely without running anything in it
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  return doc.body.textContent.trim();
}

// Find the video player link (YouTube, Vimeo, etc.) inside NASA's HTML
function findVideoUrl(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const iframe = doc.querySelector('iframe');
  if (!iframe) {
    return '';
  }

  let src = iframe.getAttribute('src') || '';
  // Some links start with "//", so we add https: to the front
  if (src.startsWith('//')) {
    src = `https:${src}`;
  }
  return src;
}

// For YouTube videos, build a thumbnail image link from the video ID
function getVideoThumbnail(videoUrl) {
  const match = videoUrl.match(/youtube\.com\/embed\/([\w-]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
}

// Turn "2025-11-07" into "November 7, 2025"
function formatDate(dateString) {
  // Adding T00:00 keeps the date from shifting because of time zones
  const date = new Date(`${dateString}T00:00`);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------------------------------------------
// Event listeners
// ---------------------------------------------
getImagesButton.addEventListener('click', getSpaceImages);

// Close the modal with the X button
modalCloseButton.addEventListener('click', closeModal);

// Close the modal by clicking the dark background
modal.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

// Close the modal with the Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) {
    closeModal();
  }
});
