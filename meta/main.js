import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Step 1.1: read the CSV; d3.csv gives strings, so convert numbers and dates
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// Step 1.2: one object per commit, instead of one row per line of code
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      // all lines in a commit share its author and timestamps, so read them from the first
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;

      let ret = {
        id: commit,
        url: 'https://github.com/feii-l/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,   // 2:30 PM = 14.5
        totalLines: lines.length,
      };

      // keep the original rows, but hidden so they don't clutter console.log
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    })
    // Lab 8 Step 3: oldest first, so the story and the scrolling go in time order
    .sort((a, b) => a.datetime - b.datetime);
}

// Step 1.3: summary stats (Lab 8: re-run whenever the slider moves, so clear the old ones first)
function renderCommitInfo(data, commits) {
  d3.select('#stats').html('');
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // number of distinct files
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  // length of each file = its highest line number; then take the largest
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (d) => d.line),
    (d) => d.file,
  );
  dl.append('dt').text('Longest file (lines)');
  dl.append('dd').text(d3.max(fileLengths, (d) => d[1]));

  dl.append('dt').text('Avg line length');
  dl.append('dd').text(Math.round(d3.mean(data, (d) => d.length)));

  // which part of the day has the most lines; d3.greatest returns the whole [period, count] pair
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most work done');
  dl.append('dd').text(maxPeriod?.replace(/^(in the|at) /, ''));   // "in the evening" -> "evening"
}

// Step 3: tooltip with details about the hovered commit
function renderTooltipContent(commit) {
  if (Object.keys(commit).length === 0) return;

  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id;

  document.getElementById('commit-date').textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  document.getElementById('commit-time').textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const gap = 12;   // keep it off the cursor so it doesn't cover the dot

  let left = event.clientX + gap;
  let top = event.clientY + gap;

  // flip to the other side of the cursor if it would run off the window
  if (left + tooltip.offsetWidth > window.innerWidth) {
    left = event.clientX - tooltip.offsetWidth - gap;
  }
  if (top + tooltip.offsetHeight > window.innerHeight) {
    top = event.clientY - tooltip.offsetHeight - gap;
  }

  tooltip.style.left = `${Math.max(0, left)}px`;
  tooltip.style.top = `${Math.max(0, top)}px`;
}

// Step 5: the brush needs these outside renderScatterPlot, so they're shared
// (Lab 8: updateScatterPlot reuses them too)
let xScale;
let yScale;
let rScale;

// was this commit's dot inside the brushed rectangle?
function isCommitSelected(selection, commit) {
  if (!selection) return false;

  // selection is [[left, top], [right, bottom]] in the same units as the scales
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const count = selectedCommits.length;
  document.querySelector('#selection-count').textContent =
    `${count || 'No'} ${count === 1 ? 'commit' : 'commits'} selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  container.innerHTML = '';
  if (selectedCommits.length === 0) return;

  const lines = selectedCommits.flatMap((d) => d.lines);

  // lines per language, e.g. Map { 'js' => 396, 'css' => 341, ... }
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  for (const [language, count] of breakdown) {
    const formatted = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// runs continuously while dragging, and once more when the brush is cleared
function brushed(event) {
  const selection = event.selection;
  d3.selectAll('.dots circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));

  // the brush's invisible overlay catches all mouse events, so move the dots above it
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// Step 2: scatterplot of commits, date on x and time of day on y
function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;

  // space around the plot for the axis labels
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // scales turn data values into pixel positions
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  // the range is [bottom, top] because svg y grows downward; this puts midnight at the bottom
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // gridline color by time of day: blue at night, pink-purple at dawn and dusk, orange at midday
  const timeColor = d3
    .scaleLinear()
    .domain([0, 6, 12, 18, 24])
    .range(['#4e79d6', '#c56cc0', '#f28e2b', '#c56cc0', '#4e79d6']);

  // gridlines first, so they sit behind everything: an axis with no labels and very long ticks
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width))
    .selectAll('.tick line')
    .attr('stroke', (d) => timeColor(d));   // each tick's data value is its hour

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');   // 9 -> "09:00", 24 -> "00:00"

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')   // Lab 8: a class so updateScatterPlot can find it again
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  // Step 4: dot size shows lines edited. Sqrt because a circle's area grows with radius squared;
  // starting at 0 makes area truly proportional (twice the lines = twice the area).
  // Lab 8: based on ALL commits, so a dot keeps the same size while the slider moves
  const maxLines = d3.max(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([0, maxLines]).range([0, 30]);

  // empty group for the dots, last so it sits on top of the axes; updateScatterPlot fills it
  svg.append('g').attr('class', 'dots');

  createBrushSelector(svg);
  updateScatterPlot(data, commits);
}

// Lab 8 Step 1.2: redraw the existing chart for a new set of commits
// (renderScatterPlot builds the chart once; this only changes the x-axis and the dots)
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  // the x-axis now spans just the commits being shown
  let [start, end] = d3.extent(commits, (d) => d.datetime);
  if (+start === +end) {
    // only one commit: pad a day on each side so the axis isn't zero-width
    start = d3.timeDay.offset(start, -1);
    end = d3.timeDay.offset(end, 1);
  }
  xScale.domain([start, end]).nice();
  svg.select('g.x-axis').call(d3.axisBottom(xScale));

  // biggest first, so small dots are drawn on top and can still be hovered
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    // Step 1.3: the key (commit id) tells D3 which circle belongs to which commit,
    // so each dot glides to its new spot instead of jumping around
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .style('fill-opacity', 0.7)   // see-through, so overlapping dots stay visible
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// Lab 8 Step 2: unit visualization, one dot per line of code, grouped by file
let colors = d3.scaleOrdinal(d3.schemeTableau10);   // one color per language (css, html, js)

function updateFileDisplay(filteredCommits) {
  // every line from the commits shown, grouped into files, biggest file first
  let lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);   // Step 2.3: the race

  // one <div> per file; the key (file name) keeps each file's row when the slider moves
  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // this only runs when a file's row is first created
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt');
          div.append('dd');
        }),
    );

  // file name, with its line count underneath
  filesContainer
    .select('dt')
    .html((d) => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);

  // Step 2.2: one small dot per line; Step 2.4: colored by language
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

let data = await loadData();
let commits = processCommits(data);

// Lab 8 Step 1.1: the slider goes 0-100; a time scale turns that into a date
let commitProgress = 100;
let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);   // invert: number -> date

// Step 1.2: only the commits up to commitMaxTime (updated as the slider moves)
let filteredCommits = commits;

renderScatterPlot(data, commits);

// Show everything up to one moment in time: chart, file dots and stats
function showCommitsUntil(maxTime) {
  commitMaxTime = maxTime;

  document.getElementById('commit-max-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  updateScatterPlot(data, filteredCommits);

  updateFileDisplay(filteredCommits);

  // the stats follow the slider too, using only the lines from the commits shown
  renderCommitInfo(filteredCommits.flatMap((d) => d.lines), filteredCommits);
}

const slider = document.getElementById('commit-progress');

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  showCommitsUntil(timeScale.invert(commitProgress));
}

slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();   // once on page load, to fill in the time and stats

// Lab 8 Step 3.2: one paragraph of story per commit. Each one gets the class "step"
// so Scrollama can watch it. The story for each commit is written by hand, keyed by commit id
const commitStories = {
  cc0c7b5: 'This is where it all started. I made the home page of my portfolio for Lab 1. It was just one small HTML file.',
  '82b08ec': 'Later that day I added the other pages. My resume, contact form and projects page all went up at once. The resume alone was almost 190 lines of HTML.',
  '72a7c44': 'For Lab 2 I gave the site its look with CSS. Almost every line in this commit went into style.css.',
  '50fd414': 'Lab 3 brought my first JavaScript. global.js now builds the navigation bar, switches between light and dark mode, and handles the contact form.',
  e8ef479: 'Eighteen minutes later I made a small fix. I updated the picture on my home page.',
  '0cfb04a': 'In Lab 4 the site started loading data. The projects page now reads from a JSON file, and the home page shows my GitHub stats.',
  '61147fc': 'Lab 5 was my first D3 chart. I added a pie chart of projects by year and a search bar to the projects page.',
  '2a32850': 'The next day I fixed a bug. The search bar and the pie chart filters now work together.',
  f2e2cbc: 'In Lab 6 I started this Meta page. It reads my commit history and shows stats about my code.',
  b1977ab: 'Thirteen minutes later I added this scatterplot, with tooltips and brushing. You are looking at the result of that commit right now.',
};

d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((d) => {
    const fileCount = d3.group(d.lines, (line) => line.file).size;
    const date = d.datetime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });
    const story = commitStories[d.id] ?? 'I kept working on the site.';   // for any newer commits
    return `
      <p class="step-date">${date}</p>
      <p>${story}</p>
      <p class="step-numbers">This <a href="${d.url}" target="_blank">commit</a>
        edited ${d.totalLines} lines across ${fileCount} ${fileCount === 1 ? 'file' : 'files'}.</p>
    `;
  });

// Step 3.3: when a commit's paragraph scrolls past the middle of the screen,
// show everything up to that commit. D3 left each commit on its element as __data__
function onStepEnter(response) {
  const commit = response.element.__data__;

  // move the slider along too, so it always matches the chart
  commitProgress = timeScale(commit.datetime);
  slider.value = commitProgress;

  showCommitsUntil(commit.datetime);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);
