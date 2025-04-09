document.getElementById('fileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.split(/\r?\n/);

    const sectionStartRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+-+\s+([A-Z0-9_]+)\s+\(.+transferred\)$/i;
    const nameLineRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.*?)\bNAME=([A-Z0-9_]+)\b.*TABLE=([a-zA-Z0-9_]+).*DECLARED_ROWS=(\d+)/;
    const sectionEndRegex = /loading of ([A-Z0-9_]+) is done$/i;
    const emptyEndRegex = /this is the last \(empty\) file, loading of ([A-Z0-9_]+) is done$/i;
    const leftRegex = /LEFT=(-?\d+)/;
    const dateRegex = /Date\s*:\s*(.+)$/;
    const sessionEndRegex = /SERVICE NOW QUERY SESSION END\s+\(Elapsed: (.*?); Files: (\d+); Bytes: ([\d,]+)\)/;

    const sectionStates = {};
    const details = [];
    let exportDate = '';
    let elapsed = '', files = '', bytes = '';

    for (const raw of lines) {
      const line = raw.trim();

      const dateMatch = line.match(dateRegex);
      if (dateMatch) exportDate = dateMatch[1];

      const sessionMatch = line.match(sessionEndRegex);
      if (sessionMatch) {
        elapsed = sessionMatch[1];
        files = sessionMatch[2];
        bytes = sessionMatch[3];
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
        const name = nameMatch[2];
        const table = nameMatch[3];
        const declaredRows = nameMatch[4];

        if (!nameMatch[1].includes('http') && !nameMatch[1].includes('Query') && !nameMatch[1].includes('SLA')) {
          sectionStates[name] = sectionStates[name] || {};
          sectionStates[name].started = true;

          details.push({ name, table, declaredRows });
        }
        continue;
      }

      const leftMatch = line.match(leftRegex);
      if (leftMatch) {
        const left = parseInt(leftMatch[1]);
        const activeSection = Object.keys(sectionStates).find(name => sectionStates[name].started && !sectionStates[name].ended);
        if (activeSection) sectionStates[activeSection].lastLeft = left;
        continue;
      }

      const emptyEndMatch = line.match(emptyEndRegex);
      if (emptyEndMatch) {
        const name = emptyEndMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].ended = true;

        const left = sectionStates[name].lastLeft;
        if (left !== undefined && left > 0) sectionStates[name].invalidEnding = true;
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

    let result = '';
    if (problemSections.length === 0) {
      result = '✅ All sections completed correctly!';
    } else {
      result = `❌ Found ${problemSections.length} section(s) with missing or invalid endings:\n\n`;
      result += problemSections.map(name => ` - ${name}`).join('\n');
    }

    // Show result box only now
    const resultBox = document.getElementById('resultBox');
    resultBox.style.display = 'block';
    document.getElementById('output').textContent = result;

    // Show date & session summary
    if (exportDate) document.getElementById('exportDate').textContent = exportDate;
    if (elapsed && files && bytes) {
      document.getElementById('sessionSummary').textContent = `Elapsed: ${elapsed}, Files: ${files}, Bytes: ${bytes}`;
    } else {
      document.getElementById('sessionSummary').textContent = 'Pump script was not completed.';
    }

    // Show table data
    const tableBody = document.querySelector('#detailsTable tbody');
    tableBody.innerHTML = '';
    for (const row of details) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.name}</td><td>${row.table}</td><td>${row.declaredRows}</td>`;
      tableBody.appendChild(tr);
    }

    if (details.length > 0) {
      document.getElementById('detailsSection').style.display = 'block';
    }
  };

  reader.readAsText(file);
});
