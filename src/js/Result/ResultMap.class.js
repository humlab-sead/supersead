import * as d3 from 'd3';
import Config from '../../config/config.js'
import ResultModule from './ResultModule.class.js'
import Timeline from './Timeline.class.js';
import HqsMenu from '../HqsMenu.class';

/*OpenLayers imports*/
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Stamen, BingMaps, TileArcGISRest } from 'ol/source';
import { Group as GroupLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { Cluster as ClusterSource, Vector as VectorSource } from 'ol/source';
import {fromLonLat, toLonLat} from 'ol/proj.js';
import { Select as SelectInteraction } from 'ol/interaction';
import { Circle as CircleStyle, Fill, Stroke, Style, Text} from 'ol/style.js';
import * as Extent from 'ol/extent';
import { transformExtent } from 'ol/proj';


/*
* Class: ResultMap
*/
class ResultMap extends ResultModule {
	/*
	* Function: constructor
	*/
	constructor(resultManager, renderIntoNode = "#result-map-container") {
		super(resultManager);
		this.renderIntoNode = renderIntoNode;
		$(this.renderIntoNode).append("<div class='result-map-render-container'></div>");
		$(this.renderIntoNode).append("<div class='result-timeline-render-container'></div>");
		this.renderMapIntoNode = $(".result-map-render-container", renderIntoNode)[0];
		this.renderTimelineIntoNode = $(".result-timeline-render-container", renderIntoNode)[0];
		
		this.olMap = null;
		this.name = "map";
		this.prettyName = "Geographic";
		this.icon = "<i class=\"fa fa-globe\" aria-hidden=\"true\"></i>";
		this.baseLayers = [];
		this.dataLayers = [];
        this.currentZoomLevel = 4;
		this.selectPopupOverlay = null;
		this.selectInteraction = null;
		

		this.style = {
			default: {
				//fillColor: [0, 102, 255, 0.6],
				fillColor: this.resultManager.hqs.color.getColorScheme(20, 0.5)[13],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			selected: {
				fillColor: this.resultManager.hqs.color.getColorScheme(20, 1.0)[14],
				strokeColor: "#fff",
				textColor: "#fff",
			},
			highlighted: {
				fillColor: "#f60",
				textColor: "#000",
				strokeColor: "#fff"
			}
		}


		let stamenLayer = new TileLayer({
			source: new Stamen({
				layer: 'terrain-background'
			}),
			visible: true
		});
		stamenLayer.setProperties({
			"layerId": "stamen",
			"title": "Stamen",
			"type": "baseLayer"
		});
		
		let bingAerialLayer = new TileLayer({
			source: new BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "Aerial"
			}),
			visible: false
		});
		bingAerialLayer.setProperties({
			"layerId": "bingAerial",
			"title": "Bing Aerial",
			"type": "baseLayer"
		});
		
		let bingAerialLabelsLayer = new TileLayer({
			source: new BingMaps({
				key: 'At_1FuTga4p88618KkMhqxYZE71lCvBhzEx7ccisF9rShHoLsDLv-5zzGh3l25X5',
				imagerySet: "AerialWithLabels"
			}),
			visible: false
		});
		bingAerialLabelsLayer.setProperties({
			"layerId": "bingAerialLabels",
			"title": "Bing Aerial + Labels",
			"type": "baseLayer"
		});
		
		let arcticDemLayer = new TileLayer({
			source: new TileArcGISRest({
				url: "http://elevation2.arcgis.com/arcgis/rest/services/Polar/ArcticDEM/ImageServer",
				attributions: "<a target='_blank' href='https://www.pgc.umn.edu/data/arcticdem/'>NSF PGC ArcticDEM</a>"
			}),
			visible: false
		});
		arcticDemLayer.setProperties({
			"layerId": "arcticDem",
			"title": "PGC ArcticDEM",
			"type": "baseLayer"
		});
		
		this.baseLayers.push(stamenLayer);
		this.baseLayers.push(bingAerialLayer);
		this.baseLayers.push(bingAerialLabelsLayer);
		this.baseLayers.push(arcticDemLayer);
		
		let dataLayer = new VectorLayer();
		dataLayer.setProperties({
			layerId: "clusterPoints",
			title: "Clustered",
			type: "dataLayer",
			renderCallback: () => {
				this.renderClusteredPointsLayer();
			},
			visible: true
		});
		this.dataLayers.push(dataLayer);

		dataLayer = new VectorLayer();
		dataLayer.setProperties({
			layerId: "points",
			title: "Individual",
			type: "dataLayer",
			renderCallback: () => {
				this.renderPointsLayer();
			},
			visible: false
		});
		this.dataLayers.push(dataLayer);

		//Set up resize event handlers
		this.resultManager.hqs.hqsEventListen("layoutResize", () => this.resizeCallback());
		$(window).on("resize", () => this.resizeCallback());
		this.resultManager.hqs.hqsEventListen("siteReportClosed", () => this.resizeCallback());

		this.timeline = new Timeline(this);
	}


	resizeCallback() {
		if(this.olMap != null) {
			//this.unrender();

			if(typeof(this.resizeTimeout) != "undefined") {
				clearTimeout(this.resizeTimeout);
			}
			this.resizeTimeout = setTimeout(() => {
				//this.renderMap(false);
				this.olMap.updateSize();
			}, 500);
		}
		
	}

	/*
	* Function: render
	*
	* Called from outside. Its the command from hqs to render the contents of this module. Will fetch data and then import/render it.
	*/
	render() {
		let xhr = this.fetchData();
		xhr.then((data, textStatus, xhr) => { //success
			if(this.active) {
				this.renderInterfaceControls();
			}
		},
		function(xhr, textStatus, errorThrown) { //error
			console.log(errorThrown);
		});
	}

	/*
	* Function: fetchData
	*/
	fetchData() {
		if(this.resultDataFetchingSuspended) {
			this.pendingDataFetch = true;
			return false;
		}
		
		var reqData = this.resultManager.getRequestData(++this.requestId, "map");

		this.resultManager.showLoadingIndicator(true);
		return $.ajax(Config.serverAddress+"/api/result/load", {
			data: JSON.stringify(reqData),
			dataType: "json",
			method: "post",
			contentType: 'application/json; charset=utf-8',
			crossDomain: true,
			success: (respData, textStatus, jqXHR) => {
				if(respData.RequestId == this.requestId && this.active) { //Only load this data if it matches the last request id dispatched. Otherwise it's old data.
					this.importResultData(respData);
					this.resultManager.showLoadingIndicator(false);
				}
				else {
					console.log("WARN: ResultMap discarding old result package data ("+respData.RequestId+"/"+this.requestId+").");
				}

			},
			error: (respData, textStatus, jqXHR) => {
				this.resultManager.showLoadingIndicator(false, true);
			},
			complete: (xhr, textStatus) => {
				
			}
		});
	}

	/*
	* Function: importResultData
	*
	* Imports result data and then renders it.
	*/
	importResultData(data) {
		this.data = [];
		var keyMap = {};

		for(var key in data.Meta.Columns) {
			if(data.Meta.Columns[key].FieldKey == "category_id") {
				keyMap.id = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "category_name") {
				keyMap.title = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "latitude_dd") {
				keyMap.lat = parseInt(key);
			}
			if(data.Meta.Columns[key].FieldKey == "longitude_dd") {
				keyMap.lng = parseInt(key);
			}
		}
		
		for(var key in data.Data.DataCollection) {
			var dataItem = {};
			dataItem.id = data.Data.DataCollection[key][keyMap.id];
			dataItem.title = data.Data.DataCollection[key][keyMap.title];
			dataItem.lng = data.Data.DataCollection[key][keyMap.lng];
			dataItem.lat = data.Data.DataCollection[key][keyMap.lat];
			
			this.data.push(dataItem);
		}
		
		/*
		//If we have over 2000 data points, switch default rendering mode to clustering
		if(this.data.length > 2000) {
			this.dataLayers.forEach((element, index, array) => {
				if(element.getProperties().layerId == "clusterPoints") {
					element.setVisible(true);
				}
				else if(element.getProperties().layerId == "points") {
					element.setVisible(false);
				}
			})
		}
		*/

		this.renderData = JSON.parse(JSON.stringify(this.data)); //Make a copy
		this.renderData = this.resultManager.hqs.hqsOffer("resultMapData", {
			data: this.renderData
		}).data;


		this.data = this.timeline.makeFakeTimeData(this.data); //FIXME: REMOVE THIS WHEN THERE IS DATA AVAILABLE

		this.renderMap();
		this.renderVisibleDataLayers();
		//this.timeline.render(); //FIXME: DISABLED UNTIL WE HAVE DATA FOR IT
		
		this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");
	}

	/*
	* Function: setContainerFixedSize
	*
	* Sets fixed size of the openlayers container. This is needed in order for the map to render properly, but it's bad for a responsive design so we switch between fixed/flexible as the viewport is resized.
	*
	* See also:
	*  - setContainerFlexibleSize
	*/
	setContainerFixedSize() {
		let containerWidth = $(this.renderMapIntoNode).width();
		let containerHeight = $(this.renderMapIntoNode).height();
		$(this.renderMapIntoNode).css("width", containerWidth+"px");
		$(this.renderMapIntoNode).css("height", containerHeight+"px");
	}

	/*
	* Function: setContainerFlexibleSize
	*
	* Sets flexible size of the openlayers container.
	* 
	* See also:
	*  - setContainerFixedSize
	*/
	setContainerFlexibleSize() {
		$(this.renderMapIntoNode).css("width", "100%");
		$(this.renderMapIntoNode).css("height", "80%");
	}

	/*
	* Function: renderMap
	*/
	renderMap(removeAllDataLayers = true) {
		let filteredData = []; //Filter out points which contrain zero/null coordinates
		for(let key in this.data) {
			if(this.data[key].lat != 0 && this.data[key].lng != 0) {
				filteredData.push(this.data[key]);
			}
		}
		
		let latHigh = this.resultManager.hqs.getExtremePropertyInList(filteredData, "lat", "high").lat;
		let latLow = this.resultManager.hqs.getExtremePropertyInList(filteredData, "lat", "low").lat;
		let lngHigh = this.resultManager.hqs.getExtremePropertyInList(filteredData, "lng", "high").lng;
		let lngLow = this.resultManager.hqs.getExtremePropertyInList(filteredData, "lng", "low").lng;
		
		let extentNW = fromLonLat([lngLow, latLow]);
		let extentSE = fromLonLat([lngHigh, latHigh]);

		let extent = extentNW.concat(extentSE);
		

		$(this.renderIntoNode).show();
		
		if(this.olMap == null) {
			$(this.renderMapIntoNode).html("");

			this.olMap = new Map({
				target: this.renderMapIntoNode,
				controls: [], //Override default controls and set NO controls
				layers: new GroupLayer({
					layers: this.baseLayers
				}),
				
				view: new View({
					center: fromLonLat([12.41, 48.82]),
					zoom: this.currentZoomLevel
				}),
				loadTilesWhileInteracting: true,
				loadTilesWhileAnimating: true
			});
			
			this.olMap.on("moveend", () => {
				var newZoomLevel = this.olMap.getView().getZoom();
				if (newZoomLevel != this.currentZoomLevel) {
					this.currentZoomLevel = newZoomLevel;
				}
			});
		}
		else {
			this.olMap.updateSize();
		}

		this.olMap.getView().fit(extent);

		//NOTE: This can not be pre-defined in HTML since the DOM object itself is removed along with the overlay it's attached to when the map is destroyed.
		let popup = $("<div></div>");
		popup.attr("id", "map-popup-container");
		let table = $("<table></table>").attr("id", "map-popup-sites-table").append("<tbody></tbody>").appendTo(popup);
		$("#result-container").append(popup);

		if(this.selectInteraction != null) {
			this.olMap.removeInteraction(this.selectInteraction);
		}

		this.selectInteraction = this.createSelectInteraction();
		this.olMap.addInteraction(this.selectInteraction);

		if(removeAllDataLayers) {
			this.dataLayers.forEach((layer, index, array) => {
				if(layer.getVisible()) {
					this.removeLayer(layer.getProperties().layerId)
				}
			});
		}

		this.resultManager.hqs.hqsEventDispatch("resultModuleRenderComplete");
	}

	/*
	* Function: renderVisibleDataLayers
	*/
	renderVisibleDataLayers() {
		for(var k in this.dataLayers) {
			var layerProperties = this.dataLayers[k].getProperties();
			if(layerProperties.visible) {
				this.dataLayers[k].setVisible(false);
				this.setMapDataLayer(layerProperties.layerId);
			}
		}
	}

	removeLayer(layerId) {
		this.olMap.getLayers().forEach((element, index, array)=> {
			if(typeof(element) != "undefined" && element.getProperties().layerId == layerId) {
				this.olMap.removeLayer(element);
			}
		});
	}
	
	/*
	* Function: renderInterface
	*/
	renderInterfaceControls() {
		//console.log("renderInterfaceControls");
		d3.select(this.renderMapIntoNode)
			.append("div")
			.attr("id", "result-map-controls-container");

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-baselayer-controls-menu");
		new HqsMenu(this.resultManager.hqs, this.resultMapBaseLayersControlsHqsMenu());

		d3.select("#result-map-controls-container")
			.append("div")
			.attr("id", "result-map-datalayer-controls-menu");
		new HqsMenu(this.resultManager.hqs, this.resultMapDataLayersControlsHqsMenu());
	}

	/*
	* Function: setMapBaseLayer
	*/
	setMapBaseLayer(baseLayerId) {
		this.baseLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == baseLayerId) {
				layer.setVisible(true);
			}
			else {
				layer.setVisible(false);
			}
		});
	}

	/*
	* Function: setMapDataLayer
	*/
	setMapDataLayer(dataLayerId) {
		this.clearSelections();
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId && layer.getVisible() == false) {
				layer.setVisible(true);
				layer.getProperties().renderCallback(this);
			}
			if(layer.getProperties().layerId != dataLayerId && layer.getVisible() == true) {
				this.removeLayer(layer.getProperties().layerId);
				layer.setVisible(false);
			}
		});
	}

	renderDataLayer(dataLayerId) {
		this.clearSelections();
		this.dataLayers.forEach((layer, index, array) => {
			if(layer.getProperties().layerId == dataLayerId) {
				this.removeLayer(layer.getProperties().layerId);
				layer.setVisible(true);
				layer.getProperties().renderCallback(this);
			}
		});
	}

	/*
	* Function: clearSelections
	*/
	clearSelections() {
		var interactions = this.olMap.getInteractions();
		interactions.forEach((interaction) => {
			var prop = interaction.getProperties();
			if(prop.selectInteraction) {
				interaction.getFeatures().clear();
				this.selectPopupOverlay.setPosition();
			}
		});
	}

	applyTimeFilterOnData(data) {
		let timeSelection = this.timeline.getSelection();

		if(timeSelection.length == 0) {
			return data;
		}

		let filtered = [];
		for(let key in data) {
			if(data[key].time.min >= timeSelection[0] && data[key].time.max <= timeSelection[1]) {
				filtered.push(data[key]);
			}
		}

		return filtered;
	}

	/*
	* Function: renderClusteredPointsLayer
	*/
	renderClusteredPointsLayer() {
		let timeFilteredData = this.applyTimeFilterOnData(this.data);
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var clusterSource = new ClusterSource({
			distance: 25,
			source: pointsSource
		});
		
		var clusterLayer = new VectorLayer({
			source: clusterSource,
			style: (feature, resolution) => {
				var style = this.getClusterPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		clusterLayer.setProperties({
			"layerId": "clusterPoints",
			"type": "dataLayer"
		});
		
		this.olMap.addLayer(clusterLayer);
	}

	/*
	* Function: renderPointsLayer
	*/
	renderPointsLayer() {
		let timeFilteredData = this.applyTimeFilterOnData(this.data);
		var geojson = this.getDataAsGeoJSON(timeFilteredData);

		var gf = new GeoJSON({
			featureProjection: "EPSG:3857"
		});
		var featurePoints = gf.readFeatures(geojson);
		
		var pointsSource = new VectorSource({
			features: featurePoints
		});
		
		var layer = new VectorLayer({
			source: pointsSource,
			style: (feature, resolution) => {
				var style = this.getPointStyle(feature);
				return style;
			},
			zIndex: 1
		});
		
		layer.setProperties({
			"layerId": "points",
			"type": "dataLayer"
		});

		this.olMap.addLayer(layer);
	}

	/*
	* Function: getDataAsGeoJSON
	*
	* Returns the internally stored data as GeoJSON, does not fetch anything from server.
	* 
	*/
	getDataAsGeoJSON(data) {
		var geojson = {
			"type": "FeatureCollection",
			"features": [
			]
		};

		for(var key in data) {
			var feature = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": [data[key].lng, data[key].lat]
				},
				"properties": {
					id: data[key].id,
					name: data[key].title
				}
			};
			geojson.features.push(feature);
		}
		return geojson;
	}

	/*
	* Function: getPointStyle
	*/
	getPointStyle(feature, options = { selected: false, highlighted: false }) {
		
		var pointSize = 8;
		var zIndex = 0;
		var text = "";
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
			zIndex = 10;
		}

		var styles = [];
		
		styles.push(new Style({
			image: new CircleStyle({
				radius: pointSize,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new Text({
				text: text,
				offsetX: 15,
				textAlign: 'left',
				fill: new Fill({
					color: '#fff'
				}),
				stroke: new Stroke({
					color: '#000',
					width: 2
				}),
				scale: 1.2
			})
			
		}));
		
		return styles;
	}

	/*
	* Function: getClusterPointStyle
	*/
	getClusterPointStyle(feature, options = { selected: false, highlighted: false }) {
		var pointsNum = feature.get('features').length;
		var clusterSizeText = pointsNum.toString();
		if(pointsNum > 999) {
			clusterSizeText = pointsNum.toString().substring(0, 1)+"k+";
		}
		var pointSize = 8+(Math.log10(feature.getProperties().features.length)*15);
		
		var zIndex = 0;
		
		//default values if point is not selected and not highlighted
		var fillColor = this.style.default.fillColor;
		var strokeColor = this.style.default.strokeColor;
		var textColor = "#fff";
		
		//if point is highlighted (its a hit when doing a search)
		if(options.highlighted) {
			fillColor = this.style.highlighted.fillColor;
			strokeColor = this.style.highlighted.strokeColor;
			textColor = this.style.highlighted.textColor;
			zIndex = 10;
		}
		//if point is selected (clicked on)
		if(options.selected) {
			fillColor = this.style.selected.fillColor;
			strokeColor = this.style.selected.strokeColor;
			textColor = this.style.selected.textColor;
			zIndex = 10;
		}

		var styles = [];
		styles.push(new Style({
			image: new CircleStyle({
				radius: pointSize,
				stroke: new Stroke({
					color: strokeColor
				}),
				fill: new Fill({
					color: fillColor
				})
			}),
			zIndex: zIndex,
			text: new Text({
				text: clusterSizeText,
				offsetY: 1,
				fill: new Fill({
					color: textColor
				})
			})
		}));
		
		
		if(pointsNum == 1) {
			var pointName = feature.get('features')[0].getProperties().name;
			if(pointName != null) {
				styles.push(new Style({
					zIndex: zIndex,
					text: new Text({
						text: pointName,
						offsetX: 15,
						textAlign: 'left',
						fill: new Fill({
							color: '#fff'
						}),
						stroke: new Stroke({
							color: '#000',
							width: 2
						}),
						scale: 1.2
					})
				}));
			}
			
		}
		
		return styles;
	}

	createSelectInteraction() {
		this.selectPopupOverlay = new Overlay({
			element: document.getElementById('map-popup-container'),
			positioning: 'bottom-center',
			offset: [0, -17]
		});
		this.olMap.addOverlay(this.selectPopupOverlay);

		var selectInteraction = new SelectInteraction({
			//condition: clickCondition,
			style: (feature) => {
				if(this.getVisibleDataLayer().getProperties().layerId == "clusterPoints") {
					return this.getClusterPointStyle(feature, {
						selected: true,
						highlighted: false
					});
				}
				else {
					return this.getPointStyle(feature, {
						selected: true,
						highlighted: false
					});
				}
			}
		});

		selectInteraction.setProperties({
			selectInteraction: true
		});
		
		selectInteraction.on("select", (evt) => {
			if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == false) {
				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = feature.getProperties();

				$("#map-popup-title").html("");
				var tableRows = "<tr row-site-id='"+prop.id+"'><td>"+prop.name+"</td></tr>";
				tableRows = hqs.hqsOffer("resultMapPopupSites", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;
				$("#map-popup-sites-table tbody").html(tableRows);

				this.selectPopupOverlay.setPosition(coords);
			}
			else if(evt.selected.length == 1 && evt.selected[0].getProperties().hasOwnProperty("features") == true) {
				$("#map-popup-container").show();

				var feature = evt.selected[0];
				var coords = feature.getGeometry().getCoordinates();
				var prop = evt.selected[0].getProperties();

				$("#map-popup-title").html("");
				
				var tableRows = "";
				for(var fk in prop.features) {
					tableRows += "<tr row-site-id='"+prop.features[fk].getProperties().id+"'><td>"+prop.features[fk].getProperties().name+"</td></tr>";
				}

				tableRows = hqs.hqsOffer("resultMapPopupSites", {
					tableRows: tableRows,
					olFeatures: prop.features
				}).tableRows;

				$("#map-popup-sites-table tbody").html(tableRows);

				$("#map-popup-show-all-sites-btn").on("click", (evt) => {
					$("#map-popup-sites-table").show();
					$("#map-popup-show-all-sites-btn").hide();
					this.selectPopupOverlay.setPosition();
					this.selectPopupOverlay.setPosition(coords);
				});
				this.selectPopupOverlay.setPosition(coords);
			}
			else {
				$("#map-popup-container").hide();
				this.selectPopupOverlay.setPosition();
			}
			hqs.hqsEventDispatch("resultMapPopupRender");
		});
		
		return selectInteraction;
	}

	/*
	* Function: getVisibleDataLayer
	*/
	getVisibleDataLayer() {
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				return this.dataLayers[key];
			}
		}
		return false;
	}

	/*
	* Function: getVisibleDataLayers
	*/
	getVisibleDataLayers() {
		var visibleLayers = [];
		for(var key in this.dataLayers) {
			if(this.dataLayers[key].getProperties().visible) {
				visibleLayers.push(this.dataLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: getVisibleBaseLayers
	*/
	getVisibleBaseLayers() {
		var visibleLayers = [];
		for(var key in this.baseLayers) {
			if(this.baseLayers[key].getProperties().visible) {
				visibleLayers.push(this.baseLayers[key]);
			}
		}
		return visibleLayers;
	}

	/*
	* Function: exportSettings
	*/
	exportSettings() {
		var struct = {};
		if(this.olMap != null) {
			struct = {
				center: this.olMap.getView().getCenter(),
				zoom: this.olMap.getView().getZoom(),
				baseLayers: [],
				dataLayers: []
			};

			var baseLayers = this.getVisibleBaseLayers();
			for(var key in baseLayers) {
				struct.baseLayers.push(baseLayers[key].getProperties().layerId);
			}
			var dataLayers = this.getVisibleDataLayers();
			for(var key in dataLayers) {
				struct.dataLayers.push(dataLayers[key].getProperties().layerId);
			}
		}
		else {
			return false;
		}

		return struct;
	}
	
	/*
	* Function: importSettings
	*/
	importSettings(settings) {
		if(typeof(settings.center) != "undefined" && typeof(settings.zoom) != "undefined") {
			this.settingsImportInterval = setInterval(() => { //Map may not have been initialized yet, so wait until it has
				if(this.olMap != null) {
					this.olMap.getView().setCenter(settings.center);
					this.olMap.getView().setZoom(settings.zoom);
					clearInterval(this.settingsImportInterval);

					if(settings.baseLayers.length > 0) {
						this.setMapBaseLayer(settings.baseLayers[0]);
					}
					if(settings.dataLayers.length > 0) {
						this.setMapDataLayer(settings.dataLayers[0]);
					}
				}
			}, 500);
		}
	}

	/*
	* Function: resultMapBaseLayersControlsHqsMenu
	*/
	resultMapBaseLayersControlsHqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-globe result-map-control-icon\" aria-hidden=\"true\"></i>&nbsp;Baselayer", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-baselayer-controls-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			]
		};

		for(var key in this.baseLayers) {
			var prop = this.baseLayers[key].getProperties();
			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		return menu;
	}

	/*
	* Function: resultMapDataLayersControlsHqsMenu
	*/
	resultMapDataLayersControlsHqsMenu() {
		var menu = {
			title: "<i class=\"fa fa-map-marker result-map-control-icon\" aria-hidden=\"true\"></i>&nbsp;Datalayer", //The name of the menu as it will be displayed in the UI
			layout: "vertical", //"horizontal" or "vertical" - the flow director of the menu items
			collapsed: true, //whether the menu expands on mouseover (like a dropdown) or it's always expanded (like tabs or buttons)
			anchor: "#result-map-datalayer-controls-menu", //the attachment point of the menu in the DOM. Must be a valid DOM selector of a single element, such as a div.
			staticSelection: true, //whether a selected item remains highlighted or not, purely visual
			visible: true, //show this menu by default
			style: {
				menuTitleClass: "result-map-control-menu-title",
				l1TitleClass: "result-map-control-item-title"
			},
			items: [ //The menu items contained in this menu
			]
		};

		for(var key in this.dataLayers) {
			var prop = this.dataLayers[key].getProperties();

			menu.items.push({
				name: prop.layerId, //identifier of this item, should be unique within this menu
				title: prop.title, //displayed in the UI
				tooltip: "",
				staticSelection: prop.visible, //For tabs - highlighting the currently selected
				callback: this.makeMapControlMenuCallback(prop)
			});
		}
		return menu;
	}

	/*
	* Function: makeMapControlMenuCallback
	*/
	makeMapControlMenuCallback(layerProperties) {
		return () => {
			switch(layerProperties.type) {
				case "dataLayer":
					this.setMapDataLayer(layerProperties.layerId);
					break;
				case "baseLayer":
					this.setMapBaseLayer(layerProperties.layerId);
					break;
			}
		}
	}

	/*
	* Function: unrender
	*/
	unrender() {
		$(this.renderIntoNode).hide();
		$("#map-popup-container").remove();
	}

	getLayerById(layerId) {
		for(let k in this.dataLayers) {
			if(this.dataLayers[k].getProperties().layerId == layerId) {
				return this.dataLayers[k];
			}
		}
		for(let k in this.baseLayers) {
			if(this.baseLayers[k].getProperties().layerId == layerId) {
				return this.baseLayers[k];
			}
		}
		return false;
	}

}

export { ResultMap as default }