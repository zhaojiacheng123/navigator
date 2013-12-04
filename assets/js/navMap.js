// Global variables
// TODO: rework so that these aren't global
var map;

var navMap = (function() {

  var stamen, stamenLabels,
    prevsw = {"lng": 0, "lat": 0},
    prevne = {"lng": 0, "lat": 0},
    prevzoom = 3,
    currentRequest;

  var filters = {"selectedInterval": {"nam": "", "mid": "", "oid": ""}, "personFilter": {"id":"", "name": ""}, "taxon": {"id": "", "name": ""}, "exist": {"selectedInterval" : false, "personFilter": false, "taxon": false}};

  // Variables used thoughout
  var width = 960,
      height = 500;

  var projection = d3.geo.hammer()
    .scale(165)
    .translate([width / 2, height / 2])
    .rotate([1e-6, 0])
    .precision(.1);

  var path = d3.geo.path()
    .projection(projection);

  return {
    "init": function() {
      // Init the leaflet map
      map = new L.Map('map', {
        center: new L.LatLng(7, 0),
        zoom: 2,
        maxZoom:10,
        minZoom: 2,
        zoomControl: false,
        inertiaDeceleration: 6000,
        inertiaMaxSpeed: 1000,
        zoomAnimationThreshold: 1
      });

      var attrib = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';

      navMap.stamen = new L.TileLayer('http://{s}.tile.stamen.com/toner-background/{z}/{x}/{y}.png', {attribution: attrib}).addTo(map);

      navMap.stamenLabels = new L.TileLayer('http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png', {attribution: attrib});

      // Called every time the map is panned, zoomed, or resized
      map.on("moveend", function(event) {
        // event.hard = true when map is adjusted programatically
        // Don't fire if adjusted programatically
        if (event.hard || parseInt(d3.select("#map").style("height")) < 2) {
          return;
        } else {
          d3.select(".info").style("display", "none");

          // If viewing the projected map...
          if (map.getZoom() < 3) {
            d3.select("#map").style("height", 0);
            d3.select("#svgMap").style("display", "block");
            setTimeout(navMap.resizeSvgMap, 300);
          }

          navMap.refresh();
        }
      });

      map.on("zoomend", function() {
        d3.select(".leaflet-zoom-hide").style("visibility", "hidden");
      });

      map.on("zoomlevelschange", function() {
        // See if labels should be applied or not
        navMap.selectBaseMap(map.getZoom());
      });

      // Get map ready for an SVG layer
      map._initPathRoot();

      // Add the SVG to hold markers to the map
      d3.select("#map").select("svg")
        .append("g")
        .attr("class", "leaflet-zoom-hide")
        .attr("id", "binHolder");

      // Hide the map after initialized
      /* Setting "display" = "none" doesn't allow us to operate on
         the map when it is invisible, so hiding/showing the leaflet 
         map is done by changing its height */
      d3.select("#map").style("height", 0);

      // Set up the projected map
      var zoom = d3.behavior.zoom()
        .on("zoom",function() {
          if (d3.event.sourceEvent.wheelDelta > 0) {
            navMap.changeMaps(d3.mouse(this));
          } else if (d3.event.sourceEvent.type == "touchmove") {
            navMap.changeMaps([d3.event.sourceEvent.pageX, d3.event.sourceEvent.pageY]);
          }
        });

      var hammer = d3.select("#svgMap").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(zoom)
        .on("click", function() {
          navMap.changeMaps(d3.mouse(this));
        })
        .append("g");

      hammer.append("defs").append("path")
        .datum({type: "Sphere"})
        .attr("id", "sphere")
        .attr("d", path);

      hammer.append("use")
        .attr("class", "fill")
        .attr("xlink:href", "#sphere");

      d3.json("build/js/countries_1e5.json", function(error, data) {
        hammer.append("path")
          .datum(topojson.feature(data, data.objects.countries))
          .attr("class", "countries")
          .attr("d", path);

        reconstructMap.resize();
        timeScale.resize();

        navMap.refresh("reset");
        navMap.resizeSvgMap();
        setTimeout(navMap.resize, 100);
        setTimeout(navMap.resize, 100);
        navMap.resizeSvgMap();
      });

    },

    "changeMaps": function(mouse) {

      var mercator = d3.geo.mercator()
        .scale(165)
        .precision(.1)
        .translate([width / 2, height / 2]);

      var coords = mouse,
        projected = mercator.invert(coords);

      d3.select("#svgMap").style("display", "none");
      d3.select("#map").style("height", function() {
        return ((window.innerHeight * 0.70) - 70) + "px";
      });

      map.setView([parseInt(projected[1]), parseInt(projected[0])], 3, {animate:false});

      navMap.refresh("reset");
      map.invalidateSize();
    },

    // Given a [lat,lng] and a zoom level, adjust the map
    "goTo": function(coords, zoom) {
      // If viewing Hammer, ignore
      if (zoom < 3) {
        return;
      } else {
        d3.select("#svgMap").style("display", "none");
        d3.select("#map").style("height", function() {
          return window.innerHeight * 0.70 + "px";
        });

        map._resetView(coords, zoom);
      }
    },

    "selectBaseMap": function(zoom) {
      if (zoom < 5) {
        if (map.hasLayer(navMap.stamenLabels)) {
          map.removeLayer(navMap.stamenLabels);
          map.addLayer(navMap.stamen);
        }
      } else if (zoom > 4 && zoom < 8) {
        if (map.hasLayer(navMap.stamenLabels)) {
          map.removeLayer(navMap.stamenLabels);
          map.addLayer(navMap.stamen);
        }
      } else {
        if (map.hasLayer(navMap.stamenLabels)) {
          map.removeLayer(navMap.stamen);
        } else {
          map.addLayer(navMap.stamenLabels);
          map.removeLayer(navMap.stamen);
        }
      }
    },

    "refresh": function(reset) {
      paleo_nav.showLoading();

      if ((prevzoom - map.getZoom()) != 0) {
        d3.select(".leaflet-zoom-hide").style("visibility", "hidden");
      }

      var filtered = navMap.checkFilters();

      // Check which map is displayed - if hammer, skip the rest
      if (parseInt(d3.select("#map").style("height")) < 1) {

        // Abort any pending requests
        if(typeof(currentRequest) != 'undefined') {
          if (Object.keys(currentRequest).length > 0) {
            currentRequest.abort();
            currentRequest = {};
          }
        }

        var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=-180&lngmax=180&latmin=-90&latmax=90&limit=999999&show=time';

        if (filtered) {
          if (filters.exist.selectedInterval == true && !filters.exist.personFilter && !filters.exist.taxon) {
            url += "&level=2";
            url = navMap.parseURL(url);

            if (typeof(timeScale.interval_hash[filters.selectedInterval.oid]) != "undefined") {
              // .. and if the level2 data for the selected interval hasn't been loaded...
              if (typeof(timeScale.interval_hash[filters.selectedInterval.oid].data) === "undefined") {
                // ...load it...
                currentRequest = d3.json(url, function(error, data) {
                  // ...and hold on to it
                  timeScale.interval_hash[filters.selectedInterval.oid].data = data;
                  return navMap.refreshHammer(data);
                });
              // If the level2 data for the selected interval has already been loaded, use that
              } else {
                return navMap.refreshHammer(timeScale.interval_hash[filters.selectedInterval.oid].data);
              }
            }

          } else {
            url += "&level=2";
            url = navMap.parseURL(url);
          }
        } else {
          url += "&level=1";
          url = navMap.parseURL(url);
        }

        currentRequest = d3.json(url, function(error, data) { 
          navMap.refreshHammer(data);
        });
        
        return;
      }

      var bounds = map.getBounds(),
        sw = bounds._southWest,
        ne = bounds._northEast,
        zoom = map.getZoom();

      if(!reset) {

        // Check if new points are needed from the server
        // If the new bounding box is a subset of the old one...
        if (prevne.lat > ne.lat && prevne.lng > ne.lng && prevsw.lat < sw.lat && prevsw.lng < sw.lng) {
          // Was there a change in the type of points needed?
          if (prevzoom < 4 && zoom > 3) {
            // refresh
          } else if (prevzoom < 7 && zoom > 6) {
            //refresh
          } else if (prevzoom === zoom) {
            prevzoom = zoom;
            paleo_nav.hideLoading();
            return;
          } else {
            var points = d3.selectAll(".bins");
            if (zoom > 6) {
              var clusters = d3.selectAll(".clusters");
              prevzoom = zoom;
              return navMap.redrawPoints(points, clusters);
            } else {
              prevzoom = zoom;
              return navMap.redrawPoints(points);
            }
          }
        } else if (prevzoom > 2 && zoom < 7) {
          if (filtered) {
            if (filters.exist.selectedInterval == true && !filters.exist.personFilter && !filters.exist.taxon) {
              if (d3.select("#binHolder").selectAll("circle")[0].length < 1) {
                // refresh
              } else if (prevzoom < 7 && zoom > 6 || prevzoom > 6 && zoom < 7) {
                //refresh
              } else {
                var points = d3.selectAll(".bins");
                if (zoom > 6) {
                  var clusters = d3.selectAll(".clusters");
                  prevzoom = zoom;
                  return navMap.redrawPoints(points, clusters);
                } else {
                  prevzoom = zoom;
                  return navMap.redrawPoints(points);
                }
              }
            }
          }
        }
      }

      prevsw = sw;
      prevne = ne;
      prevzoom = zoom;
      // Make sure bad requests aren't made
      //sw.lng = (sw.lng < -180) ? -180 : sw.lng;
      sw.lat = (sw.lat < -90) ? -90 : sw.lat;
      //ne.lng = (ne.lng > 180) ? 180 : ne.lng;
      ne.lat = (ne.lat > 90) ? 90 : ne.lat;

      // Redefine to check if we are crossing the date line
      //bounds = map.getBounds();

      // Abort any pending requests
      if(typeof(currentRequest) != 'undefined') {
        if (Object.keys(currentRequest).length > 0) {
          currentRequest.abort();
          currentRequest = {};
        }
      }

      // Depending on the zoom level, call a different service from PaleoDB, feed it a bounding box, and pass it to the proper point parsing function

      if (zoom < 4 && filtered == false) {
        var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&level=1&limit=999999&show=time';

        currentRequest = d3.json(navMap.parseURL(url), function(error, data) {
          navMap.drawBins(data, 1, zoom);
          /*if (bounds._southWest.lng < -180 || bounds._northEast.lng > 180) {
            navMap.refreshDateline(1, data);
          } else {
            navMap.drawBins(data, 1, zoom);
          }*/
        });
      } else if (zoom > 3 && zoom < 7 || zoom < 4 && filtered == true) {

        // If filtered only by a time interval...
        if (filters.exist.selectedInterval == true && !filters.exist.personFilter && !filters.exist.taxon) {
          var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=-180&lngmax=180&latmin=-90&latmax=90&limit=999999&show=time&level=2';
          url = navMap.parseURL(url);

          if (typeof(timeScale.interval_hash[filters.selectedInterval.oid]) != "undefined") {
            // .. and if the level2 data for the selected interval hasn't been loaded...
            if (typeof(timeScale.interval_hash[filters.selectedInterval.oid].data) === "undefined") {
              // ...load it...
              currentRequest = d3.json(url, function(error, data) {
                // ...and hold on to it
                timeScale.interval_hash[filters.selectedInterval.oid].data = data;
                return navMap.drawBins(data, 2, zoom);
              });
            // If the level2 data for the selected interval has already been loaded, use that
            } else {
              return navMap.drawBins(timeScale.interval_hash[filters.selectedInterval.oid].data, 2, zoom);
            }
          }
        // If not filtered only by a time interval, refresh normally
        } else {
          var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&level=2&limit=99999&show=time';

          currentRequest = d3.json(navMap.parseURL(url), function(error, data) {
            navMap.drawBins(data, 2, zoom);
          });
        }

        /*if (bounds._southWest.lng < -180 || bounds._northEast.lng > 180) {
        navMap.refreshDateline(2);
       } */

      } else {
        var url = paleo_nav.baseUrl + '/data1.1/colls/list.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&limit=99999999&show=time';

        /*if (bounds._southWest.lng < -180 || bounds._northEast.lng > 180) {
          navMap.refreshDateline(3);
        }*/
        currentRequest = d3.json(navMap.parseURL(url), function(error, data) {
          navMap.drawCollections(data, 3, zoom);
        });
        
      }
    },

    // Adjust the positioning of the SVG elements relative to the map frame
    "redrawPoints": function(points, clusters) {
      d3.select(".leaflet-zoom-hide").style("visibility", "hidden");

      var zoom = map.getZoom();
      if (zoom < 4) {
        if (navMap.checkFilters()) {
          var scale = d3.scale.log()
            .domain([1, 400])
            .range([4,30]);
          } else {
            var scale = d3.scale.linear()
            .domain([1, 4140])
            .range([4, 30]);
          }
      } else if (zoom > 3 && zoom < 7 ) {
        var scale = d3.scale.log()
          .domain([1, 400])
          .range([4,30]);
      } else {
        var scale = d3.scale.linear()
          .domain([1, 50])
          .range([12, 30]);
      }
      points.attr("cx",function(d) { return map.latLngToLayerPoint([d.lat,d.lng]).x});
      points.attr("cy",function(d) { return map.latLngToLayerPoint([d.lat,d.lng]).y});
      if (clusters) {
        clusters.attr("cx",function(d) { return map.latLngToLayerPoint([d.lat,d.lng]).x});
        clusters.attr("cy",function(d) { return map.latLngToLayerPoint([d.lat,d.lng]).y});
        clusters.attr("r", function(d) { return scale(d.members.length); })
        points.attr("r", 12);
      } else {
        if (d3.select("#binHolder").selectAll(".bins")[0].length < 30) {
          points.attr("r", 8);
        } else {
          points.attr("r", function(d) { return scale(d.nco)*navMap.multiplier(zoom) < 4 ? 4 : scale(d.nco)*navMap.multiplier(zoom); });
        }
      }

      paleo_nav.hideLoading();
  
      d3.select(".leaflet-zoom-hide").style("visibility", "visible");
    },

    "refreshHammer": function(data) {
      var scale = d3.scale.linear()
        .domain([1, 4240])
        .range([4, 15]);

      var hammer = d3.select("#svgMap").select("svg").select("g"),
          zoom = 2;

      var bins = hammer.selectAll("circle")
        .data(data.records);

      bins.enter().append("circle")
        .attr("class", "bins")
        .on("mouseout", function() {
          d3.select(".info")
            .html("")
            .style("display", "none");
          timeScale.unhighlight()
        });

      bins
        .style("fill", function(d) { return (timeScale.interval_hash[d.cxi]) ? timeScale.interval_hash[d.cxi].col : "#000"; })
        .attr("id", function(d) { return "p" + d.cxi; })
        .attr("r", function(d) { return scale(d.nco)*navMap.multiplier(zoom); })
        .attr("cx", function(d) {
          var coords = projection([d.lng, d.lat]);
          return coords[0];
        })
        .attr("cy", function(d) {
          var coords = projection([d.lng, d.lat]);
          return coords[1];
        })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openBinModal(d);
        });
      
      bins.exit().remove();

      if (!reconstructMap.reconstructing) {
        paleo_nav.hideLoading();
      }

    },

    "drawBins": function(data, level, zoom) {
      d3.selectAll(".clusters").remove();

      var g = d3.select("#binHolder");

      // Add the bins to the map
      var points = g.selectAll(".bins")
        .data(data.records);

      points
        .attr("id", function(d) { return "p" + d.cxi; })
        .style("fill", function(d) { return (timeScale.interval_hash[d.cxi]) ? timeScale.interval_hash[d.cxi].col : "#000"; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openBinModal(d);
        });

      points.enter().append("circle")
        .attr("class", "bins")
        .attr("id", function(d) { return "p" + d.cxi; })
        .style("fill", function(d) { return (timeScale.interval_hash[d.cxi]) ? timeScale.interval_hash[d.cxi].col : "#000"; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("Number of collections: " + d.nco + "<br>Number of occurrences: " + d.noc)
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openBinModal(d);
        })
        .on("mouseout", function() {
          d3.select(".info")
            .html("")
            .style("display", "none");
          timeScale.unhighlight()
        })
        .on("dblclick", function(d) {
          if (level == 1) {
            map.setView(d.LatLng, 6);
          } else if (level == 2) {
            map.setView(d.LatLng, 8);
          }
        });

      points.exit().remove();

      // Update the SVG positioning
      navMap.redrawPoints(points);
    },

    "drawCollections": function(data, level, zoom) {
      var g = d3.select("#binHolder");

      // Many collections share the same coordinates, making it necessary to create clusters of like coordinates
      var clusters = [];
      // For each collection, check it's coordinates against all others and see if any matches exist
      for (var i=0; i<data.records.length; i++) {
        for (var j=0; j<data.records.length; j++) {
          // If another collection has the same lat/lng and a different OID, create a new cluster
          // SIDENOTE: this could be extended for binning by specifying a tolerance instead of an exact match of coordinates
          if (data.records[i].lat == data.records[j].lat && data.records[i].lng == data.records[j].lng && data.records[i].oid != data.records[j].oid) {
            var newCluster = {"lat":data.records[i].lat, "lng":data.records[i].lng, "members": []},
                exists = 0;
            // Make sure a cluster with those coordinates doesn't already exist
            for (var z=0; z<clusters.length;z++) {
              if (newCluster.lat == clusters[z].lat && newCluster.lng == clusters[z].lng) {
                exists += 1;
              }
            }
            // If a cluster doesn't already exist with those coordinates, add the cluster to the cluster array
            if (exists < 1) {
              clusters.push(newCluster);
              break;
            // Otherwise, ignore it
            } else {
              break;
            }
          }
        }
      }
      // Loop through all the collections and place them into the proper cluster, if applicable
      // Collections placed into a cluster are kept track of using toRemove. They are not removed from
      // data.records immediately because the length of data.records is being used to count the loop
      // Also keep track of rock formations
      var toRemove = [];
      for (var i=0; i<clusters.length; i++) {
        for (var j=0; j<data.records.length; j++) {
          if (clusters[i].lat == data.records[j].lat && clusters[i].lng == data.records[j].lng) {
            clusters[i].members.push(data.records[j]);
            toRemove.push(data.records[j].oid);
          }
        }
      }
      // Remove all clustered collections from data.records
      for (var i=0; i<toRemove.length; i++) {
        var index = navMap.getIndex(data.records, toRemove[i], "oid");
        data.records.splice(index, 1);
      }
      
      // Create a Leaflet Lat/lng for all clusters
      clusters.forEach(function(d) {
        //var clusterBottoms = [],
        //  clusterTops = [],
        var totalOccurrences = [];

        d.members.forEach(function(e) {
          //clusterBottoms.push(e.eag);
          //clusterTops.push(e.lag);
          totalOccurrences.push(e.noc);
        });
        //d.ageTop = d3.min(clusterTops);
        //d.ageBottom = d3.max(clusterBottoms);
        // TODO: fix this to something more accurate
        /* Annecdotal evidence suggests all collections that share a lat/lng should be from the 
          same interval, but I doubt that it's always true */
        d.cxi = d.members[0].cxi;
        d.noc = d3.sum(totalOccurrences);
      });

      var clusters = g.selectAll(".clusters")
        .data(clusters);

      clusters
        .style("fill", function(d) { return timeScale.interval_hash[d.cxi].col; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openCollectionModal(d);
        })
        .on("mouseout", function(d) {
          timeScale.unhighlight();
        });
      
      clusters.enter().append("circle")
        .attr("class", "clusters")
        .attr("id", function(d) { return "p" + d.members[0].cxi; })
        .style("fill", function(d) { return (timeScale.interval_hash[d.members[0].cxi]) ? timeScale.interval_hash[d.members[0].cxi].col : "#000"; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("<strong>" + d.members.length + " collections</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("mouseout", function(d) {
          timeScale.unhighlight();
        })
        .on("click", function(d) {
          navMap.openStackedCollectionModal(d);
        });
      
      clusters.exit().remove();

      var points = g.selectAll(".bins")
        .data(data.records);

      existingPoints = points
        .style("fill", function(d) { return (timeScale.interval_hash[d.cxi]) ? timeScale.interval_hash[d.cxi].col : "#000"; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openCollectionModal(d);
        })
        .on("mouseout", function(d) {
          timeScale.unhighlight();
        });

      points.enter().append("circle")
        .attr("id", function(d) { return "p" + d.cxi })
        .attr("class", "bins")
        .style("fill", function(d) { return (timeScale.interval_hash[d.cxi]) ? timeScale.interval_hash[d.cxi].col : "#000"; })
        .on("mouseover", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
        })
        .on("click", function(d) {
          d3.select(".info")
            .html("<strong>" + d.nam + "</strong><br>" + d.noc + " occurrences")
            .style("display", "block");
          timeScale.highlight(this);
          navMap.openCollectionModal(d);
        })
        .on("mouseout", function(d) {
          timeScale.unhighlight();
        });

      points.exit().remove();

      navMap.redrawPoints(points, clusters);

    },

    "openCollectionModal": function(d) {
      d3.json(paleo_nav.baseUrl + "/data1.1/colls/single.json?id=" + d.oid + "&show=ref,time", function(err, data) {

        data.records.forEach(function(d) {
          d.intervals = (d.oli) ? d.oei + " - " + d.oli : d.oei;
          d.fmm = (d.fmm) ? d.fmm : "Unknown";
          d.grp = (d.grp) ? d.grp : "Unknown";
          d.mbb = (d.mbb) ? d.mbb : "Unknown";
          d.lit = (d.lit) ? d.lit : "Unknown";
          d.env = (d.env) ? d.env : "Unknown";
        });

        var template = '{{#records}}<table class="table"><tr><td style="border-top:0;"><strong>Collection number</strong></td><td style="border-top:0;">{{oid}}</td></tr><tr><td><strong>Occurrences</strong></td><td>{{noc}}</td></tr><tr><td><strong>Group</strong></td><td>{{grp}}</td></tr><tr><td><strong>Formation</strong></td><td>{{fmm}}</td></tr><tr><td><strong>Member</strong></td><td>{{mbb}}</td></tr><tr><td><strong>Interval(s)</strong></td><td>{{intervals}}</td></tr><tr><td><strong>Lithology</strong></td><td>{{lit}}</td></tr><tr><td><strong>Environment</strong></td><td>{{env}}</td></tr><tr><td><strong>Location</strong><br><small>(latitude, longitude)</small></td><td>{{lat}}, {{lng}}</td></tr><tr><td><strong>Reference</strong></td><td>{{{ref}}}</td></tr></table>{{/records}}';

        var output = Mustache.render(template, data);
        $("#collectionName").html(data.records[0].nam);
        $("#collectionModalBody").html(output);
        $("#collectionBox").modal();
      });
    },

    "openBinModal": function(d) {
      var id = (d.properties) ? d.properties.oid : d.oid,
          url = paleo_nav.baseUrl + "/data1.1/colls/list.json?clust_id=" +id;

      url = navMap.parseURL(url);
      url += "&show=ref,loc,time";

      d3.json(url, function(err, data) {
        data.records.forEach(function(d) {
          d.intervals = (d.oli) ? d.oei + " - " + d.oli : d.oei;
          d.fmm = (d.fmm) ? d.fmm : "Unknown";
          d.grp = (d.grp) ? d.grp : "Unknown";
          d.mbb = (d.mbb) ? d.mbb : "Unknown";
          d.lit = (d.lit) ? d.lit : "Unknown";
          d.env = (d.env) ? d.env : "Unknown";
        });

      var template = '{{#records}}<div class="panel panel-default"><a class="accordion-toggle" data-toggle="collapse" data-parent="#accordion" href="#collapse{{oid}}"><div class="panel-heading"><p class="panel-title">{{nam}}</p></div></a><div id="collapse{{oid}}" class="panel-collapse collapse"><div class="panel-body"><table class="table"><tr><td style="border-top:0;"><strong>Collection number</strong></td><td style="border-top:0;">{{oid}}</td></tr><tr><td><strong>Occurrences</strong></td><td>{{noc}}</td></tr><tr><td><strong>Group</strong></td><td>{{grp}}</td></tr><tr><td><strong>Formation</strong></td><td>{{fmm}}</td></tr><tr><td><strong>Member</strong></td><td>{{mbb}}</td></tr><tr><td><strong>Interval(s)</strong></td><td>{{intervals}}</td></tr><tr><td><strong>Lithology</strong></td><td>{{lit}}</td></tr><tr><td><strong>Environment</strong></td><td>{{env}}</td></tr><tr><td><strong>Location</strong><br><small>(latitude, longitude)</small></td><td>{{lat}}, {{lng}}</td></tr><tr><td><strong>Reference</strong></td><td>{{{ref}}}</td></tr></table></div></div></div>{{/records}}';

        var output = Mustache.render(template, data);
        d3.select("#binID").html("Bin " + id);
        d3.select("#accordion").html(output);

        $("#collectionModal").modal();
      });
    },

    "openStackedCollectionModal": function(data) {
      data.members.forEach(function(d) {
        d.intervals = (d.oli) ? d.oei + " - " + d.oli : d.oei;
        d.fmm = (d.fmm) ? d.fmm : "Unknown";
        d.grp = (d.grp) ? d.grp : "Unknown";
        d.mbb = (d.mbb) ? d.mbb : "Unknown";
        d.lit = (d.lit) ? d.lit : "Unknown";
        d.env = (d.env) ? d.env : "Unknown";
      });

      var template = '{{#members}}<div class="panel panel-default"><a class="accordion-toggle" data-toggle="collapse" data-parent="#accordion" href="#collapse{{oid}}"><div class="panel-heading"><p class="panel-title">{{nam}}</p></div></a><div id="collapse{{oid}}" class="panel-collapse collapse collectionCollapse"><div class="panel-body"><table class="table"><tr><td style="border-top:0;"><strong>Collection number</strong></td><td style="border-top:0;">{{oid}}</td></tr><tr><td><strong>Occurrences</strong></td><td>{{noc}}</td></tr><tr><td><strong>Group</strong></td><td>{{grp}}</td></tr><tr><td><strong>Formation</strong></td><td>{{fmm}}</td></tr><tr><td><strong>Member</strong></td><td>{{mbb}}</td></tr><tr><td><strong>Interval(s)</strong></td><td>{{intervals}}</td></tr><tr><td><strong>Lithology</strong></td><td>{{lit}}</td></tr><tr><td><strong>Environment</strong></td><td>{{env}}</td></tr><tr><td><strong>Location</strong><br><small>(latitude, longitude)</small></td><td>{{lat}}, {{lng}}</td></tr><tr><td><strong>Reference</strong></td><td id="ref{{oid}}"></td></tr></table></div></div></div>{{/members}}';

      var output = Mustache.render(template, data);

      d3.select("#binID").html("Collections at [" + data.lat + ", " + data.lng + "]");
      d3.select("#accordion").html(output);

      $(".collectionCollapse").on("show.bs.collapse", function(d) {
        var id = d.target.id;
        id = id.replace("collapse", "");
        d3.json(paleo_nav.baseUrl + "/data1.1/colls/single.json?id=" + id + "&show=ref", function(err, data) {
          $("#ref" + id).html(data.records[0].ref);
        });
      });

      $("#collectionModal").modal();
    },

  // TODO: remove this function()?
    "refreshDateline": function(lvl) {
      var bounds = map.getBounds(),
          sw = bounds._southWest,
          ne = bounds._northEast,
          zoom = map.getZoom(),
          west;

      sw.lng = (sw.lng < -180) ? sw.lng + 360 : sw.lng;
      sw.lat = (sw.lat < -90) ? -90 : sw.lat;
      ne.lng = (ne.lng > 180) ? ne.lng - 360 : ne.lng;
      ne.lat = (ne.lat > 90) ? 90 : ne.lat;

      bounds = map.getBounds();
      if (bounds._southWest.lng < -180) {
        west = true;
        ne.lng = 180;
      }
      if (bounds._northEast.lng > 180) {
        west = false;
        sw.lng = -180;
      }
      switch(lvl) {
        case 1: 
          var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&level=1&limit=999999&show=time';
          url = navMap.parseURL(url);
          d3.json(url, function(error, response) {
            response.records.forEach(function(d) {
              if (west) {
                d.LatLng = new L.LatLng(d.lat,d.lng - 360);
              } else {
                d.LatLng = new L.LatLng(d.lat,d.lng + 360);
              }
            });
            navMap.drawBins(response, 1, zoom);
          });
          break;
        case 2:
          var url = paleo_nav.baseUrl + '/data1.1/colls/summary.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&level=2&limit=99999&show=time';
          url = navMap.parseURL(url);
          d3.json(url, function(error, response) {
            response.records.forEach(function(d) {
              if (west) {
                d.LatLng = new L.LatLng(d.lat,d.lng - 360);
              } else {
                d.LatLng = new L.LatLng(d.lat,d.lng + 360);
              }
            });
            navMap.drawBins(response, 2, zoom);
          });
          break;
        case 3:
          var url = paleo_nav.baseUrl + '/data1.1/colls/list.json?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&limit=99999999&show=time';
           url = navMap.parseURL(url);
           d3.json(url, function(error, response) {
            response.records.forEach(function(d) {
              if (west) {
                d.LatLng = new L.LatLng(d.lat,d.lng - 360);
              } else {
                d.LatLng = new L.LatLng(d.lat,d.lng + 360);
              }
            });
            navMap.drawCollections(response, 3, zoom);
          });
          //TODO add query and call appropriate function
          break;
      }
    },

    "buildWKT": function(data) {
      var requestString = "";
      for(var i=0; i<data.length; i++) {
        requestString += "POINT(" + data[i].lat + " " + data[i].lng + " " + data[i].oid + "),"
      }
      requestString = requestString.slice(0, -1);
      requestString = encodeURI(requestString);
      return requestString;
    },

    "parseURL": function(url) {
      var count = 0;
      for (var key in filters.exist) {
        if (filters.exist.hasOwnProperty(key)) {
          if (filters.exist[key] == true) {
            switch(key) {
              case "selectedInterval":
                url += '&interval_id=' + filters.selectedInterval.oid;
                break;
              case "personFilter":
                url += '&person_id=' + filters.personFilter.id;
                break;
              case "taxon":
                url += '&base_id=' + filters.taxon.id;
                break;
            }
            count += 1;
          }
        }
      }
      if (count > 0 && d3.select("#reconstructMap").style("display") == "none") {
        d3.select(".filters").style("display", "block");
      }

      return url;
    },

    // Check if any filters are applied to the map
    "checkFilters": function() {
      var count = 0;
      for (var key in filters.exist) {
        if (filters.exist.hasOwnProperty(key)) {
          if (filters.exist[key] == true) {
            count += 1;
          }
        }
      }
      if (count > 0) {
        d3.select(".filters").style("display", "block");
        d3.select("#filterTitle").html("Filters");
        return true;
      } else {
        d3.select(".filters").style("display", "none");
        d3.select("#filterTitle").html("No filters selected");
        return false;
      }
    },

    "getIndex": function(data, term, property) {
      for(var i=0, len=data.length; i<len; i++) {
        if (data[i][property] === term) return i;
      }
      return -1;
    },

    // Adjust the size of the markers depending on zoom level
    "multiplier": function(zoom) {
      switch(zoom) {
        case 2:
          return 0.70;
          break; 
        case 3:
          if (navMap.checkFilters()) {
            return 0.38;
          } else {
            return 1;
          }
          break;
        case 4:
          if (navMap.checkFilters()) {
            return 0.48;
          } else {
            return 0.38;
          }
          break;
        case 5:
          if (navMap.checkFilters()) {
            return 0.68;
          }
          return 0.6;
          break;
        case 6:
          if (navMap.checkFilters()) {
            return 0.88;
          } else {
            return 0.8;
          }
          break;
        case 7:
          return 1.5;
          break;
        default:
          return 1;
          break;
      }
    },
    
    "resizeSvgMap": function() {
      var width = parseInt(d3.select("#graphics").style("width"));

      var g = d3.select("#svgMap").select("svg");

      d3.select("#svgMap").select("svg")
        .select("g")
        .attr("transform", function() {
          /* Firefox hack via https://github.com/wout/svg.js/commit/ce1eb91fac1edc923b317caa83a3a4ab10e7c020 */
          var box;
          try {
            box = g.node().getBBox()
          } catch(err) {
            box = {
              x: g.node().clientLeft,
              y: g.node().clientTop,
              width: g.node().clientWidth,
              height: g.node().clientHeight
            }
          }
          var height = ((window.innerHeight * 0.70) - 70);
          if (width > (box.width + 50)) {
            return "scale(" + window.innerHeight/800 + ")translate(" + ((width - box.width)/2) + ",0)";
          } else {
            var svgHeight = ((window.innerHeight * 0.70) - 70),
                mapHeight = (width/970 ) * 500;
            return "scale(" + width/970 + ")translate(0," + (svgHeight - mapHeight)/2 + ")";
          }

        });

      d3.select("#svgMap").select("svg")
        .style("height", function(d) {
          return ((window.innerHeight * 0.70) - 70) + "px";
        })
        .style("width", function(d) {
          return width - 15 + "px";
        });
    },

    "resize": function() {
      if (parseInt(d3.select("#map").style("height")) > 1) { 
        d3.select("#map")
          .style("height", function(d) {
            return ((window.innerHeight * 0.70) - 70) + "px";
          });
        map.invalidateSize();
      } else {
        navMap.resizeSvgMap();
      }
      
      d3.select("#infoContainer")
        .style("height", function(d) {
          return ((window.innerHeight * 0.70) - 70) + "px";
        });

      d3.select(".filters")
        .style("bottom", function() {
          var height = parseInt(d3.select("#time").select("svg").style("height"));
          return (height + 20) + "px";
        });

    },

    "refreshFilterHandlers": function() {
      d3.selectAll(".removeFilter").on("click", function() {
        var parent = d3.select(this).node().parentNode;
        parent = d3.select(parent);
        parent.style("display", "none").html("");
        var type = parent.attr("id");
        filters.exist[type] = false;

        var keys = Object.keys(filters[type]);
        for (var i=0; i < keys.length; i++) {
          filters[type][keys[i]] = "";
        }

        if (d3.select("#reconstructMap").style("display") == "block") {
          reconstructMap.rotate(filters.selectedInterval);
        } else {
          navMap.refresh("reset");
        }

        switch(type) {
          case "selectedInterval":
            d3.select(".time").style("box-shadow", "");
            timeScale.unhighlight();
            break;
          case "personFilter":
            d3.select(".userFilter").style("box-shadow", "");
            break;
          case "taxon":
            d3.select(".taxa").style("box-shadow", "");
            break;
        }

      });
    },

    "updateFilterList": function(type) {

      switch(type) {
        case "selectedInterval":
          d3.select("#selectedInterval")
            .style("display", "block")
            .html(filters.selectedInterval.nam + '<button type="button" class="close removeFilter" aria-hidden="true">&times;</button>');
          d3.select(".time").style("box-shadow", "inset 3px 0 0 #ff992c");
          navMap.refreshFilterHandlers();
          break;
        case "personFilter":
          d3.select("#personFilter")
            .style("display", "block")
            .html(filters.personFilter.name + '<button type="button" class="close removeFilter" aria-hidden="true">&times;</button>');
          d3.select(".userFilter").style("box-shadow", "inset 3px 0 0 #ff992c");
          navMap.refreshFilterHandlers();
          break;
        case "taxon":
          d3.select("#taxon")
            .style("display", "block")
            .html(filters.taxon.name + '<button type="button" class="close removeFilter" aria-hidden="true">&times;</button>');
          d3.select(".taxa").style("box-shadow", "inset 3px 0 0 #ff992c");
          navMap.refreshFilterHandlers();
          break;
      }
      
      d3.select(".filters")
        .style("bottom", function() {
          var height = parseInt(d3.select("#time").select("svg").style("height"));
          return (height + 20) + "px";
        });
    },

    "filterByTime": function(time) {
      // accepts a named time interval
      var d = d3.selectAll('rect').filter(function(e) {
        return e.nam === time;
      });
      d = d[0][0].__data__;
      filters.selectedInterval.nam = d.nam;
      filters.selectedInterval.mid = d.mid;
      filters.selectedInterval.col = d.col;
      filters.selectedInterval.oid = d.oid;
      filters.exist.selectedInterval = true;
      navMap.updateFilterList("selectedInterval");
    },

    "filterByTaxon": function(name) {
      if (!name) {
        var name = $("#taxaInput").val();
      }
      
      taxaBrowser.goToTaxon(name);

    },

    "filterByPerson": function(person, norefresh) {
      if (person) {
        filters.exist.personFilter = true;
        filters.personFilter.id = person.oid;
        filters.personFilter.name = (person.name) ? person.name : person.nam;
        navMap.updateFilterList("personFilter");
        d3.select(".userToggler").style("display", "none");
        d3.select(".userFilter")
            .style("color", "");

        if (d3.select("#reconstructMap").style("display") == "block") {
          reconstructMap.rotate(filters.selectedInterval);
        } else {
          navMap.refresh("reset");
        }
      }
    },

    "downloadView": function() {
      var bounds = map.getBounds(),
          sw = bounds._southWest,
          ne = bounds._northEast;

      if (parseInt(d3.select("#map").style("height")) < 1) {
        sw.lng = -180,
        ne.lng = 180,
        sw.lat = -90,
        ne.lat = 90;
      }

      var url = paleo_nav.baseUrl + '/data1.1/colls/list.';

      if ($("#tsv:checked").length > 0) {
        url += "txt";
      } else {
        url += "csv";
      }

      url += '?lngmin=' + sw.lng + '&lngmax=' + ne.lng + '&latmin=' + sw.lat + '&latmax=' + ne.lat + '&limit=99999999';
      url = navMap.parseURL(url);

      var options = [];
      if ($("#loc:checked").length > 0) {
        options.push("loc");
      }
      if ($("#ref:checked").length > 0) {
        options.push("ref");
      }
      if ($("#t:checked").length > 0) {
        options.push("time");
      }
      if (options.length > 0) {
        url += "&show=";
        options.forEach(function(d) {
          url += d + ",";
        });
      }
      url = url.substring(0, url.length - 1);
      window.open(url);
    },

    "restoreState": function(state) {
    /*TODO: should probably change this check to something like 
      Array.isArray(state) to check if it's an array, and
      Object.keys(state).length > 0 for an object.

      Right now it doesn't matter...just checking if something was passed,
      but eventually an array will indicate a preserved URL state, whereas
      an object will indicate another type of preserved state, i.e. something
      like the example map states
    */
      if (typeof state == "object") {
        var params = state;
        if (params.zoom > 2) {
          navMap.goTo(params.center, params.zoom);
        }
        if (params.timeScale != "Phanerozoic") {
          timeScale.goTo(params.timeScale);
        }
        if (params.taxonFilter.id > 0) {
          navMap.filterByTaxon(params.taxonFilter.nam);
        }
        if (typeof(params.timeFilter) == "object") {
          navMap.filterByTime(params.timeFilter.nam);
        }
        if (params.authFilter.id > 0) {
          navMap.filterByPerson(params.authFilter);
        }
        
        navMap.resize();
        window.scrollTo(0,0);
      }

    //TODO: this is the bones of allowing saving/retrieving of map states via url 
      /*var location = window.location,
          state = location.hash.substr(2);

      // If there is a preserved state hash
      if (state.length > 1) {
        d3.json(paleo_nav.baseUrl + "/data1.1/...?key=" + state, function(error, result) {
          var params = result.records[0];

          if (params.zoom > 2) {
            navMap.goTo(params.center, params.zoom);
          }
          if (params.timeScale != "Phanerozoic") {
            timeScale.goTo(params.timeScale);
          }
          if (params.taxonFilter.id > 0) {
            navMap.filterByTaxon(params.taxonFilter.nam);
          }
          if (typeof(params.timeFilter) == "object") {
            navMap.filterByTime(params.timeFilter.nam);
          }
          if (params.authFilter.id > 0) {
            navMap.filterByPerson(params.authFilter);
          }
          if (reconstruct == "block") {
            navMap.rotate(params.currentReconstruction);
          }
        });
      } else {
        return;
      }*/
    },

    "getUrl": function() {
      //placeholder for generating a unique a unique hash
      var center = map.getCenter(),
          zoom = map.getZoom(),
          reconstruct = d3.select("#reconstructMap").style("display");

      var params = {"timeScale": timeScale.currentInterval.nam, "taxonFilter": filters.taxon, "timeFilter": filters.selectedInterval, "authFilter": filters.personFilter, "zoom": zoom, "center": [center.lat, center.lng], "reconstruct": reconstruct, "currentReconstruction": reconstructMap.currentReconstruction};
      
      return params;
    },

    "stamen": stamen,
    "stamenLabels": stamenLabels,
    "filters": filters
  }
})();