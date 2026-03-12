document.getElementById('fileInput').addEventListener('change', function (event) {

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {

    const lines = e.target.result.split(/\r?\n/);

    const requiredPhrases = [
      'SNOW-FLOW service',
      'SERVICE NOW QUERY SESSION BEGIN'
    ];

    const fileIsValid = requiredPhrases.every(p =>
      lines.some(line => line.includes(p))
    );

    const resultBox = document.getElementById('resultBox');
    const output = document.getElementById('output');
    const detailsSection = document.getElementById('detailsSection');
    const table = document.getElementById('detailsTable');
    const exportDateSpan = document.getElementById('exportDate');
    const sessionSummarySpan = document.getElementById('sessionSummary');
    const tableBody = document.querySelector('#detailsTable tbody');

    resultBox.classList.remove('success');
    resultBox.style.display = 'block';
    detailsSection.style.display = 'none';
    table.style.display = 'none';
    exportDateSpan.textContent = '';
    sessionSummarySpan.textContent = '';
    tableBody.innerHTML = '';

    if (!fileIsValid) {
      output.textContent = '❌ Invalid file. Please upload a valid ServiceNow export log.';
      return;
    }

    const exportDate = extractDate(lines);
    const sections = parseLog(lines);
    const issues = validateSections(sections);

    renderResults(sections, issues);

    if (exportDate) exportDateSpan.textContent = exportDate;

    sessionSummarySpan.textContent =
      'Session processed (new logs do not contain explicit END message).';

  };

  reader.readAsText(file);

});


function extractDate(lines) {

  const dateRegex = /Date\s*:\s*(.+)/;

  for (const line of lines) {

    const match = line.match(dateRegex);

    if (match) return match[1];

  }

  return '';

}



function parseLog(lines) {

  const sections = [];
  let current = null;

  const nameRegex =
    /\.\.\.NAME=([A-Z0-9_]+);\s*TABLE=([a-zA-Z0-9_]+);\s*DECLARED_ROWS=(\d+)/;

  const portionRegex =
    /PORTION=\d+;\s*RECEIVED=(\d+).*LEFT=(-?\d+)/;

  const endRegex =
    /loading of ([A-Z0-9_]+) is done/i;

  for (const raw of lines) {

    const line = raw.trim();

    const nameMatch = line.match(nameRegex);

    if (nameMatch) {

      current = {
        name: nameMatch[1],
        table: nameMatch[2],
        declaredRows: parseInt(nameMatch[3]),
        portions: [],
        completed: false
      };

      sections.push(current);
      continue;

    }

    const portionMatch = line.match(portionRegex);

    if (portionMatch && current) {

      current.portions.push({
        received: parseInt(portionMatch[1]),
        left: parseInt(portionMatch[2])
      });

      continue;

    }

    const endMatch = line.match(endRegex);

    if (endMatch && current) {

      current.completed = true;

      // keep section but stop writing to it
      current = null;

    }

  }

  return sections;

}



function validateSections(sections) {

  const issues = [];

  for (const section of sections) {

    const totalReceived =
      section.portions.reduce((sum, p) => sum + p.received, 0);

    const lastLeft =
      section.portions.length
        ? section.portions[section.portions.length - 1].left
        : null;

    const completed =
      section.completed || lastLeft === 0;

    if (!completed) {

      issues.push({
        section: section.name,
        problem: 'Section did not complete'
      });

      continue;

    }

    if (totalReceived !== section.declaredRows) {

      issues.push({
        section: section.name,
        problem: 'Row count mismatch',
        declared: section.declaredRows,
        received: totalReceived
      });

    }

  }

  return issues;

}



function renderResults(sections, issues) {

  const resultBox = document.getElementById('resultBox');
  const output = document.getElementById('output');
  const detailsSection = document.getElementById('detailsSection');
  const table = document.getElementById('detailsTable');
  const tableBody = document.querySelector('#detailsTable tbody');

  if (issues.length === 0) {

    resultBox.classList.add('success');
    output.textContent = '✅ All sections completed correctly!';

  } else {

    output.textContent =
      `❌ Found ${issues.length} issue(s):\n\n` +
      issues.map(i => `${i.section} - ${i.problem}`).join('\n');

  }

  if (sections.length > 0) {

    detailsSection.style.display = 'block';
    table.style.display = 'table';

    sections.forEach((section, index) => {

      const totalReceived =
        section.portions.reduce((sum, p) => sum + p.received, 0);

      const status =
        totalReceived === section.declaredRows
          ? '✅ OK'
          : '⚠ Mismatch';

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${section.name.toLowerCase()}</td>
        <td>${section.table}</td>
        <td>${section.declaredRows}</td>
        <td>${totalReceived}</td>
        <td>${status}</td>
      `;

      tableBody.appendChild(tr);

    });

  }

}
