document.getElementById('fileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.split(/\r?\n/);
    const requiredPhrases = [
      '%%%%%%% SNOW-FLOW service',
      '%%%%%%% SNOW-FLOW service has been started in the scheduled mode',
      'SERVICE NOW QUERY SESSION BEGIN',
    ];

    const fileIsValid = requiredPhrases.every(phrase =>
      lines.some(line => line.includes(phrase))
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

    const sectionStartRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+-+\s+([A-Z0-9_]+)\s+\(.+transferred\)$/i;
    const nameLineRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.*?)\bNAME=([A-Z0-9_]+)\b.*TABLE=([a-zA-Z0-9_]+).*DECLARED_ROWS=(\d+)/;
    const sectionEndRegex = /loading of ([A-Z0-9_]+) is done$/i;
    const emptyEndRegex = /this is the last \(empty\) file, loading of ([A-Z0-9_]+) is done$/i;
    const leftRegex = /LEFT=(-?\d+)/;
    const dateRegex = /Date\s*:\s*(.+)$/;
    const summaryRegex = /SERVICE NOW QUERY SESSION END\s+\(Elapsed:\s*(.+);\s*Files:\s*(\d+);\s*Bytes:\s*([0-9,]+)\)/i;

    const sectionStates = {};
    const details = [];

    let exportDate = '';
    let sessionSummary = 'Pump script was not completed.';

    for (const raw of lines) {
      const line = raw.trim();

      const dateMatch = line.match(dateRegex);
      if (dateMatch) exportDate = dateMatch[1];

      const summaryMatch = line.match(summaryRegex);
      if (summaryMatch) {
        const [_, elapsed, files, bytes] = summaryMatch;
        sessionSummary = `Elapsed: ${elapsed}, Files: ${files}, Bytes: ${bytes}`;
      }

      const startMatch = line.match(sectionStartRegex);
      if (startMatch) {
        const name = startMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].started = true;
        continue;
      }

      const nameMatch = line.match(nameLineRegex);
      if (nameMatch) {
        const prefix = nameMatch[1];
        const name = nameMatch[2];
        const table = nameMatch[3];
        const declaredRows = nameMatch[4];

        if (!prefix.includes('http') && !prefix.includes('Query') && !prefix.includes('SLA')) {
          sectionStates[name] = sectionStates[name] || {};
          sectionStates[name].started = true;
          details.push({ name, table, declaredRows });
        }
        continue;
      }

      const leftMatch = line.match(leftRegex);
      if (leftMatch) {
        const left = parseInt(leftMatch[1]);
        const active = Object.keys(sectionStates).find(n => sectionStates[n].started && !sectionStates[n].ended);
        if (active) sectionStates[active].lastLeft = left;
        continue;
      }

      const emptyEndMatch = line.match(emptyEndRegex);
      if (emptyEndMatch) {
        const name = emptyEndMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].ended = true;
        const left = sectionStates[name].lastLeft;
        if (left !== undefined && left > 0) {
          sectionStates[name].invalidEnding = true;
        }
        continue;
      }

      const endMatch = line.match(sectionEndRegex);
      if (endMatch) {
        const name = endMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].ended = true;
        continue;
      }
    }

    const problemSections = Object.entries(sectionStates)
      .filter(([_, state]) => state.started && (!state.ended || state.invalidEnding))
      .map(([name]) => name);

    if (problemSections.length === 0) {
      resultBox.classList.add('success');
      output.textContent = '✅ All sections completed correctly!';
    } else {
      output.textContent = `❌ Found ${problemSections.length} section(s) with issues:\n\n` +
        problemSections.map(name => ` - ${name}`).join('\n');
    }

    if (exportDate) exportDateSpan.textContent = exportDate;
    sessionSummarySpan.textContent = sessionSummary;

    if (details.length > 0) {
      detailsSection.style.display = 'block';
      table.style.display = 'table';
      for (const row of details) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.name}</td>
          <td>${row.table}</td>
          <td>${row.declaredRows}</td>
        `;
        tableBody.appendChild(tr);
      }
    }
  };

  reader.readAsText(file);
});
