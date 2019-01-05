/* eslint-disable */

import React from 'react';
import { render } from 'react-dom';

var pages = [];
var errMsg = '';

var HelloMessage = React.createClass({
  render: function() {
    return <span>Hello: {this.props.status}</span>;
  }
});

$.getJSON(pubRef.relPath + '/pages.json')
  .fail(function(jqXHR) { errMsg = 'unable to load /pages.json'; })
  .done(function(data) { pages = data; })
  .always(function() {
    render(
      <HelloMessage status={errMsg || pages.length} />,
      document.getElementById('headertext')
    );
  });
