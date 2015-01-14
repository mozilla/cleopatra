[![Build Status](https://travis-ci.org/bgirard/cleopatra.svg)](https://travis-ci.org/bgirard/cleopatra)

![Cleopatra Screenshot](/images/screenshot.png?raw=true)

Cleopatra
=========

Cleopatra is a webpage to visualize performance profiles. It was written to be used by the Gecko Profiler but can in theory be used by any profiler that can output to JSON. The UI runs entirely client-side except for a few profile storage and retrieval option.

Code
====
Directory js:
  ui.js - Fetches profiles, dispatches heavy requests to parserWorker.js, display the processed data.
  parserWorker.js - Parses the profiles, handling filtering, searching and grouping.
  tree.js - Custom tree view control.

Running
=======
1) Open index.html. Note that some features, such as reading local profiles, will either require you to run a webserver using 'run_webserver.sh' if you have python installed or setting 'security.fileuri.strict_origin_policy;false' in about:config.
2) Add ?report=<id> to an existing profile you have upload for easy testing.

 or

1) Install the 'Gecko Profiler Add-on'
2) Set 'profiler.url' to your local copy of index.html such as 'file:///Volumes/Guest%20OS/Users/bgirard/ben/sps/cleopatra/index.html' and 'Analyze' a profile.

 or

1) Open index.html and load a profile from a file

Contributing
============
1) Fork 'https://github.com/bgirard/cleopatra' on github.
2) Push changes to your local fork.
3) Submit a github pull request
