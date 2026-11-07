import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
    });
}

// Step 1.3: summary stats
function renderCommitInfo(data, commits) {
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
let xScale;
let yScale;

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
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const count = selectedCommits.length;
  document.querySelector('#selection-count').textContent =
    `${count || 'No'} ${count === 1 ? 'commit' : 'commits'} selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
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
    .call(xAxis);

  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  // Step 4: dot size shows lines edited. Sqrt because a circle's area grows with radius squared;
  // starting at 0 makes area truly proportional (twice the lines = twice the area)
  const maxLines = d3.max(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([0, maxLines]).range([0, 30]);

  // biggest first, so small dots are drawn on top and can still be hovered
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  // dots last, so they sit on top of the axes
  svg
    .append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(sortedCommits)
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

  createBrushSelector(svg);
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
