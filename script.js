(() => {
  const form = document.querySelector('form');
  const input = document.querySelector('#search');
  const results = document.querySelector('main section');

  if (!form || !input || !results) {
    return;
  }

  const heading = document.querySelector('main h2');
  const originalHeading = heading ? heading.textContent : 'Image results';
  const status = document.createElement('p');
  const loadMoreButton = document.createElement('button');
  let continuation = null;
  let activeController = null;
  let searchId = 0;
  let isLoading = false;
  const displayedIds = new Set();

  status.id = 'image-search-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.margin = '18px 0';

  loadMoreButton.type = 'button';
  loadMoreButton.textContent = 'Load more images';
  loadMoreButton.hidden = true;
  loadMoreButton.style.cssText = 'display:block;margin:20px auto;padding:10px 18px;cursor:pointer;';

  results.insertAdjacentElement('beforebegin', status);
  results.insertAdjacentElement('afterend', loadMoreButton);
  results.setAttribute('aria-live', 'polite');
  results.setAttribute('aria-busy', 'false');

  const style = document.createElement('style');
  style.textContent = `
    main section[aria-live="polite"] {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .image-search-card {
      display: block;
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      border-radius: 10px;
      background: #f4f4f4;
      transition: transform 160ms ease, box-shadow 160ms ease;
    }
    .image-search-card:hover,
    .image-search-card:focus-visible {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px #0002;
    }
    .image-search-card img {
      display: block;
      width: 100%;
      height: 190px;
      margin: 0;
      object-fit: cover;
      background: #e8e8e8;
    }
    .image-search-caption {
      display: block;
      padding: 10px 12px;
      font-size: 14px;
      line-height: 1.4;
    }
    @media (max-width: 520px) {
      main section[aria-live="polite"] {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
      }
      .image-search-card img { height: 150px; }
    }
  `;
  document.head.append(style);

  function appendImages(pages) {
    Object.values(pages || {}).forEach((page) => {
      const image = page.imageinfo && page.imageinfo[0];
      if (!image || !image.thumburl || displayedIds.has(page.pageid)) {
        return;
      }

      displayedIds.add(page.pageid);
      const link = document.createElement('a');
      link.className = 'image-search-card';
      link.href = image.descriptionurl || page.fullurl || 'https://commons.wikimedia.org/';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${page.title.replace(/^File:/, '')} (opens on Wikimedia Commons)`);

      const thumbnail = document.createElement('img');
      thumbnail.src = image.thumburl;
      thumbnail.alt = (image.extmetadata && image.extmetadata.ImageDescription &&
        image.extmetadata.ImageDescription.value.replace(/<[^>]*>/g, '').trim()) ||
        page.title.replace(/^File:/, '');
      thumbnail.loading = 'lazy';

      const caption = document.createElement('span');
      caption.className = 'image-search-caption';
      caption.textContent = page.title.replace(/^File:/, '');
      link.append(thumbnail, caption);
      results.append(link);
    });
  }

  async function searchImages(query, append = false) {
    if ((isLoading && append) || !query) {
      return;
    }

    isLoading = true;
    const currentSearchId = ++searchId;
    if (!append) {
      if (activeController) {
        activeController.abort();
      }
      activeController = new AbortController();
      continuation = null;
      displayedIds.clear();
      results.replaceChildren();
      if (heading) {
        heading.textContent = `Results for “${query}”`;
      }
    }

    results.setAttribute('aria-busy', 'true');
    loadMoreButton.hidden = true;
    status.textContent = append ? 'Loading more images…' : 'Searching images…';

    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '600',
      format: 'json',
      origin: '*'
    });

    if (append && continuation) {
      Object.entries(continuation).forEach(([key, value]) => params.set(key, value));
    }

    try {
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        signal: activeController.signal
      });
      if (!response.ok) {
        throw new Error(`Image search failed (${response.status}).`);
      }

      const data = await response.json();
      if (currentSearchId !== searchId) {
        return;
      }

      const pages = data.query && data.query.pages;
      const startingCount = results.childElementCount;
      appendImages(pages);
      continuation = data.continue || null;

      if (results.childElementCount === startingCount && !append) {
        status.textContent = `No images found for “${query}”. Try another search.`;
      } else {
        status.textContent = results.childElementCount
          ? `${results.childElementCount} images shown for “${query}”.`
          : `No more images found for “${query}”.`;
      }
      loadMoreButton.hidden = !continuation;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      if (currentSearchId === searchId) {
        status.textContent = 'Image search could not be completed. Check your connection and try again.';
        if (!append && heading) {
          heading.textContent = originalHeading;
        }
      }
    } finally {
      if (currentSearchId === searchId) {
        isLoading = false;
        results.setAttribute('aria-busy', 'false');
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      status.textContent = 'Enter a word or phrase to search for images.';
      input.focus();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('q', query);
    window.history.replaceState(null, '', url);
    searchImages(query);
  });

  loadMoreButton.addEventListener('click', () => {
    searchImages(input.value.trim(), true);
  });

  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) {
    input.value = initialQuery;
    searchImages(initialQuery.trim());
  }
})();