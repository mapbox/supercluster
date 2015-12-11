'use strict';

var rbush = require('rbush');

module.exports = supercluster;

function supercluster(options) {
    return new SuperCluster(options);
}

function SuperCluster(options) {
    this.options = Object.create(this.options);
    for (var key in options) this.options[key] = options[key];
    options = this.options;

    this.trees = [];
    for (var z = 0; z <= options.maxZoom; z++) {
        this.trees[z] = rbush(options.nodeSize);
        this.trees[z].toBBox = toBBox;
    }
}

SuperCluster.prototype = {
    options: {
        nodeSize: 9,
        maxZoom: 16
    },

    load: function (points) {
        this.trees[this.options.maxZoom].load(points);
    }
};

function toBBox(p) {
    return [p[0], p[1], p[0], p[1]];
}
