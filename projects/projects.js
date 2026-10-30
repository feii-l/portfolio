import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

const title = document.querySelector('.projects-title');
title.textContent = `${projects?.length ?? 0} Projects`;

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

// a color scale
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// The two filters
let query = '';            // text in the search box
let selectedYear = null;   // year picked on the pie

// projects matching the search text
function filterProjects(query) {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// projects matching the search text AND the selected year (if any)
function getVisibleProjects() {
  return filterProjects(query).filter(
    (project) => selectedYear === null || project.year === selectedYear,
  );
}

function renderPieChart(projectsGiven) {
  // projects per year, e.g. [['2026', 5], ['2025', 2], ...]
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,   // what to compute for each group: how many projects
    (d) => d.year,     // how to group: by year
  );

  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));

  let svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // if the selected year has no matching projects any more, drop the selection
  if (!data.some((d) => d.label === selectedYear)) {
    selectedYear = null;
  }

  function updateSelection() {
    // .classed() adds/removes just the "selected" class and keeps any others (like legend-item)
    svg.selectAll('path').classed('selected', (_, idx) => data[idx].label === selectedYear);
    legend.selectAll('li').classed('selected', (_, idx) => data[idx].label === selectedYear);
  }

  function selectWedge(i) {
    let year = data[i].label;
    selectedYear = selectedYear === year ? null : year;

    updateSelection();
    renderProjects(getVisibleProjects(), projectsContainer, 'h2');
  }

  arcs.forEach((arc, idx) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[idx].label))
      .on('click', () => selectWedge(idx));
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => selectWedge(idx));
  });

  updateSelection();
}

// draw the chart for all projects when the page loads
renderPieChart(projects);

let searchInput = document.querySelector('.searchBar');

// 'input' fires on every keystroke, so results update as you type
// ('change' would only fire when you press Enter or leave the box)
searchInput.addEventListener('input', (event) => {
  query = event.target.value;

  renderPieChart(filterProjects(query));
  renderProjects(getVisibleProjects(), projectsContainer, 'h2');
});
