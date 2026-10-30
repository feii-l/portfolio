console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// const navLinks = $$('nav a');
//
// let currentLink = navLinks.find(
//   (a) => a.host === location.host && a.pathname === location.pathname,
// );
// currentLink?.classList.add('current');

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/feii-l', title: 'GitHub' },
];

const BASE_PATH = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? '/portfolio/'        
  : '/portfolio/';       

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;

  url = !url.startsWith('http') ? BASE_PATH + url : url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;
  nav.append(a);

  // highlight the link to the page we're on
  a.classList.toggle(
    'current',
    a.host === location.host && a.pathname === location.pathname,
  );

  if (a.host !== location.host) {
    a.target = '_blank';
  }
}

// Step 4.2: dark mode switch
const osScheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light';

document.body.insertAdjacentHTML(
  'afterbegin',
  `
	<label class="color-scheme">
		Theme:
		<select>
			<option value="light dark">Automatic (${osScheme})</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	</label>`,
);

// Step 4.4: make the switch change the theme
let select = document.querySelector('.color-scheme select');

// apply a color scheme and keep the dropdown in sync with it
function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

// Step 4.5: on page load, restore the saved preference (if there is one)
if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', function (event) {
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;   // remember it for next time
});

// Step 5: better contact form (only the contact page has a form)
let form = document.querySelector('form');

form?.addEventListener('submit', function (event) {
  event.preventDefault();   // stop the browser's own (badly encoded) submission

  let data = new FormData(form);
  let params = [];

  for (let [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }

  let url = form.action + '?' + params.join('&');
  location.href = url;   // a mailto: URL opens the email client
});

// Lab 4 Step 1.2: load JSON data (e.g. lib/projects.json)
export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);
    console.log(response);   // inspect in DevTools; remove once it works

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

// Lab 4 Step 1.4: build one <article> per project inside containerElement
export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  // make sure we were given a real element to put the projects in
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects: containerElement is not a valid element', containerElement);
    return;
  }

  // only allow real heading tags; fall back to h2 for anything else
  const validHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  if (!validHeadings.includes(headingLevel)) {
    console.warn(`renderProjects: "${headingLevel}" is not a heading level, using h2`);
    headingLevel = 'h2';
  }

  // clear what's already there so projects aren't added twice
  containerElement.innerHTML = '';

  // nothing to show (empty array, or the JSON failed to load)
  if (!projects || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects to show yet.</p>';
    return;
  }

  for (let project of projects) {
    const article = document.createElement('article');
    // images stored in this site (e.g. "images/x.png") need BASE_PATH so they work from any page
    const image = project.image.startsWith('http') ? project.image : BASE_PATH + project.image;

    // if the project has a link, make its title clickable (opens in a new tab)
    const title = project.url
      ? `<a href="${project.url}" target="_blank">${project.title}</a>`
      : project.title;

    article.innerHTML = `
      <${headingLevel}>${title}</${headingLevel}>
      <img src="${image}" alt="${project.title}">
      <div>
        <p>${project.description}</p>
        <p class="project-year">c. ${project.year}</p>
      </div>
    `;
    containerElement.appendChild(article);
  }
}

// Lab 4 Step 3.2: public profile data from GitHub's API
export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
