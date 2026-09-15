'use strict';

function responderJson(route, status, json) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
}

module.exports = { responderJson };
