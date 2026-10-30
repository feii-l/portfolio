import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

const title = document.querySelector('.projects-title');
title.textContent = `${projects?.length ?? 0} Projects`;

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);


let colors = d3.scaleOrdinal(d3.schemeTableau10);


let query = '';            
let selectedYear = null;   


function filterProjects(query) {
  return projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}


function getVisibleProjects() {
  return filterProjects(query).filter(
    (project) => selectedYear === null || project.year === selectedYear,
  );
}

function renderPieChart(projectsGiven) {
  
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,   
    (d) => d.year,     
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

  
  if (!data.some((d) => d.label === selectedYear)) {
    selectedYear = null;
  }

  function updateSelection() {

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


renderPieChart(projects);

let searchInput = document.querySelector('.searchBar');



searchInput.addEventListener('input', (event) => {
  query = event.target.value;

  renderPieChart(filterProjects(query));
  renderProjects(getVisibleProjects(), projectsContainer, 'h2');
});
