self.onmessage = function (msg) {
  try {
    switch (msg.data.task) {
      case "parseRawProfile":
        parseRawProfile(msg.data.requestID, msg.data.rawProfile);
        break;
    }
  } catch (e) {
    dump("Exception: " + e + "\n");
  }
}

function parseRawProfile(requestID, rawProfile) {
  var symbolicationTable = {};

  if (typeof rawProfile == "string" && rawProfile[0] == "{") {
    // rawProfile is a JSON string.
    rawProfile = JSON.parse(rawProfile);
  }
  if (typeof rawProfile == "object") {
    switch (rawProfile.format) {
      case "profileStringWithSymbolicationTable,1":
        symbolicationTable = rawProfile.symbolicationTable;
        rawProfile = rawProfile.profileString;
        break;
      default:
        throw "Unsupported profile JSON format";
    }
  }

  var data = rawProfile;
  var lines = data.split("\n");
  var extraInfo = {};
  var symbols = [];
  var symbolIndices = {};
  var functions = [];
  var functionIndices = {};

  function makeSample(frames, extraInfo, lines) {
    return {
      frames: frames,
      extraInfo: extraInfo,
      lines: lines
    };
  }

  function cloneSample(sample) {
    return makeSample(sample.frames.clone(), sample.extraInfo, sample.lines.clone());
  }

  function cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.substr(0, ignoredPrefix.length) == ignoredPrefix)
      return functionName.substr(ignoredPrefix.length);
    return functionName;
  }

  function getFunctionInfo(fullName) {
    var match =
      /^(.*) \(in ([^\)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\) (\(.*:.*\))$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\)$/.exec(fullName) ||
      /^(.*)$/.exec(fullName);
    return {
      functionName: cleanFunctionName(match[1]),
      libraryName: match[2] || "",
      lineInformation: match[3] || ""
    };
  }

  function indexForFunction(functionName, libraryName) {
    if (functionName in functionIndices)
      return functionIndices[functionName];
    var newIndex = functions.length;
    functions[newIndex] = {
      functionName: functionName,
      libraryName: libraryName
    };
    functionIndices[functionName] = newIndex;
    return newIndex;
  }

  function parseSymbol(symbol) {
    var info = getFunctionInfo(symbol);
    return {
      symbolName: symbol,
      functionIndex: indexForFunction(info.functionName, info.libraryName),
      lineInformation: info.lineInformation
    };
  }

  function translatedSymbol(symbol) {
    return symbolicationTable[symbol] || symbol;
  }

  function indexForSymbol(symbol) {
    if (symbol in symbolIndices)
      return symbolIndices[symbol];
    var newIndex = symbols.length;
    symbols[newIndex] = parseSymbol(translatedSymbol(symbol));
    symbolIndices[symbol] = newIndex;
    return newIndex;
  }

  var samples = [];
  var sample = null;
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    if (line.length < 2 || line[1] != '-') {
      // invalid line, ignore it
      continue;
    }
    var info = line.substring(2);
    switch (line[0]) {
    //case 'l':
    //  // leaf name
    //  if ("leafName" in extraInfo) {
    //    extraInfo.leafName += ":" + info;
    //  } else {
    //    extraInfo.leafName = info;
    //  }
    //  break;
    case 'm':
      // marker
      if (!("marker" in extraInfo)) {
        extraInfo.marker = [];
      }
      extraInfo.marker.push(info);
      break;
    case 's':
      // sample
      var sampleName = info;
      sample = makeSample([indexForSymbol(sampleName)], extraInfo, []);
      samples.push(sample);
      extraInfo = {}; // reset the extra info for future rounds
      break;
    case 'c':
    case 'l':
      // continue sample
      if (sample) { // ignore the case where we see a 'c' before an 's'
        sample.frames.push(indexForSymbol(info));
      }
      break;
    case 'r':
      // responsiveness
      if (sample) {
        sample.extraInfo["responsiveness"] = parseFloat(info);
      }
      break;
    }
    if (sample != null)
      sample.lines.push(line);
  }
  self.postMessage({
    requestID: requestID,
    parsedProfile: { symbols: symbols, functions: functions, samples: samples}
  });
}