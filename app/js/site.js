'use strict';
/* Where Manuscribe is published: the one place to change if it moves, say to a domain of its own. The front page,
   the downloaded copy's check for a newer version, and the links to help all read it from here.

   Moving the website moves where browsers keep each user's work (by address): before announcing a new address,
   keep the old one up, so that people can make a backup there and open it at the new one. */
window.ME = window.ME || {};
ME.SITE = {
  // the website: the front page is here, the app in app/
  home: 'https://drdhaval2785.github.io/manuscribe/',
  // the source, the issue tracker and the releases
  repo: 'https://github.com/drdhaval2785/manuscribe',
  // the newest downloadable copy: the same address for every release
  download: 'https://github.com/drdhaval2785/manuscribe/releases/latest/download/Manuscribe.zip',
};
