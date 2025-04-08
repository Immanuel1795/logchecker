document.getElementById('fileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.split(/\r?\n/);

    const sectionStartRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+-+\s+([A-Z0-9_]+)\s+\(.+transferred\)$/i;
    const nameLineRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.*?)\bNAME=([A-Z0-9_]+)\b/;
    const sectionEndRegex = /loading of ([A-Z0-9_]+) is done$/i;
    const emptyEndRegex = /this is the last \(empty\) file, loading of ([A-Z0-9_]+) is done$/i;
    const leftRegex = /LEFT=(-?\d+)/;

    const sectionStates = {};

    for (const raw of lines) {
      const line = raw.trim();

      // Start - dashed header
      const startMatch = line.match(sectionStartRegex);
      if (startMatch) {
        const name = startMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].started = true;
        continue;
      }

      // Start - strict NAME= line (timestamped and no junk)
      const nameMatch = line.match(nameLineRegex);
      if (nameMatch) {
        const prefix = nameMatch[1];
        const name = nameMatch[2];

        // Heuristic: exclude if the line looks like a URL or query string
        if (!prefix.includes('http') && !prefix.includes('Query') && !prefix.includes('SLA')) {
          sectionStates[name] = sectionStates[name] || {};
          sectionStates[name].started = true;
        }
        continue;
      }

      // LEFT seen
      const leftMatch = line.match(leftRegex);
      if (leftMatch) {
        const left = parseInt(leftMatch[1]);
        const activeSection = Object.keys(sectionStates).find(name => sectionStates[name].started && !sectionStates[name].ended);
        if (activeSection) {
          sectionStates[activeSection].lastLeft = left;
        }
        continue;
      }

      // Empty end
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

      // Normal end
      const endMatch = line.match(sectionEndRegex);
      if (endMatch) {
        const name = endMatch[1];
        sectionStates[name] = sectionStates[name] || {};
        sectionStates[name].ended = true;
        continue;
      }
    }

    // Final check
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

    document.getElementById('output').textContent = result;
  };

  reader.readAsText(file);
});
