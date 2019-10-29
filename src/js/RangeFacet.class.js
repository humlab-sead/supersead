import Facet from './Facet.class.js';
import noUiSlider from "nouislider";
//import "../../node_modules/nouislider/distribute/nouislider.min.css";
import "nouislider/distribute/nouislider.min.css";
import styles from '../stylesheets/style.scss'
import Config from "../config/config";

/*
Works like this:

When a new selection is made, new data is fetched from the server with the "picks" specified.
This new dataset contains the proper resolution, which we might degrade further client-side.
Max number of categories determines this.
Categories are always kept separate from the source/server data in the internal structures.
Categories should be seen purely as a render thing, not as a dataset you use to work with internally, it's just for display.

Old request data should be discarded (if a new selection was made while data was being fetched)

Data is loaded into "unfiltered" if it was requested without picks - which will give us the entire dataspan, but at low resolution, most importantly it tells us the endpoints
Data is loaded into "filtered" if it was requested with picks. This gives up the higher resolution data we need for a more zoomed in / narrow view of the data


	FIXME: MS filter - Select 1979 - 3000, There's data at 2877-2898, now select 2027-3000, data is gone
	FIXME: Also, slider doesn't move to proper position when manual input is used
*/



/*
* Class: RangeFacet
* Subclass of Facet. Renders data as a graph with a max/min slider.
*/
class RangeFacet extends Facet {
	/*
	* Function: constructor
	*/
	constructor(hqs, id = null, template = {}) {
		super(hqs, id, template);
		this.datasets = {
			unfiltered: [],
			filtered: []
		};
		this.selections = [];
		this.chart = null;
		this.sliderElement = null;
		this.minDataValue = null;
		this.maxDataValue = null;
		this.numberOfCategories = 50; //Number of categories (bars) we want to abstract dataset
		$(".facet-text-search-btn", this.getDomRef()).hide(); //range facets do not have text searching...
	}
	
	/*
	* Function: setSelections
	* 
	* Parameters:
	* selections - An array containing exactly 2 values, min & max, where min has index 0 and max index 1
	*/
	setSelections(selections) {
		console.log("SetSelections", selections);
		let selectionsUpdated = false;
		if(selections.length == 2) {
			if(selections[0] != null && selections[0] != this.selections[0]) {
				this.selections[0] = parseFloat(selections[0]);
				selectionsUpdated = true;
			}
			if(selections[1] != null && selections[1] != this.selections[1]) {
				this.selections[1] = parseFloat(selections[1]);
				selectionsUpdated = true;
			}
		}

		$(".slider-manual-input-container[endpoint='upper'] > input", this.getDomRef()).val(this.selections[1]);
		$(".slider-manual-input-container[endpoint='lower'] > input", this.getDomRef()).val(this.selections[0]);

		
		if(selectionsUpdated) {
			console.log("Fetching new data")
			this.fetchData();
		}
		
		
		/*
		if(loadData) {
			var promise = this.fetchData();
			promise.done((data) => {
				console.log("Loading complete captain...", data);
				this.importData(data);
				if(updateUi) {
					this.updateChart();
					this.updateSlider();
				}
			});
		}
		*/
		
		/*
		if(updateUi && loadData == false) {
			this.updateChart();
			this.updateSlider();
		}
		*/
	}


	/*
	* Function: importData
	*
	* Imports the data package fetched from the server by converting it to the internal data structure format and storing it in the instance.
	*
	* Parameters:
	* data - The data package from the server.
	*
	* Returns:
	* The imported/converted data structure.
	*/
	importData(importData, overwrite = true) {
		super.importData();

		let filteredData = false;
		for(let k in importData.Picks) {
			if(importData.Picks[k].FacetCode == this.name) {
				//This is a dataset narrowed by a selection, so import it into the filtered section of the dataset
				filteredData = true;
			}
		}

		let targetSection = null;
		if(filteredData) {
			this.datasets.filtered = [];
			targetSection = this.datasets.filtered;
		}
		else {
			this.datasets.unfiltered = [];
			targetSection = this.datasets.unfiltered;
		}


		//Create internal format
		for(let itemKey in importData.Items) {
			targetSection.push({
				//Value spans:
				gt: importData.Items[itemKey].Extent[0], //Greater Than - except for the first item which should be >=
				lt: importData.Items[itemKey].Extent[1], //Lesser Than - except for the last item which should be <=
				value: importData.Items[itemKey].Count //value/count for this category/span
			});
		}

		
		//Server only sends spans which have data, so we fill out any missing zero-spans ourselves to keep a consistent data structure
		//UPDATE: Not sure this is true anymore...
		/*
		let lv = this.getLowestDataValue(this.data);
		if(lv != this.getSelections()[0]) {
			//FIXME: This block of code is untested
			console.log("Lowest data value is lower than data from server");

			let lowestDataPoint = this.data[0];
			let selections = this.getSelections();
			let spanSize = (this.data[0].gt - this.data[0].lt)*-1;

			//Generate new data points with zero-values
			let i = 1;
			let startPoint = lowestDataPoint.gt;
			while(lowestDataPoint.gt < selections[0]) {
				let dataPoint = {
					gt: startPoint - spanSize * i,
					lt: startPoint - spanSize * (i+1),
					value: -1
				}
				this.data.unshift(dataPoint);
				lowestDataPoint = dataPoint;
			}
		}

		let hv = this.getHighestDataValue(this.data);
		if(hv != this.getSelections()[1]) {
			console.log("Highest data value is higher than data from server");

			let highestDataPoint = this.data[this.data.length-1];
			let selections = this.getSelections();
			let i = 0;
			let startingPoint = highestDataPoint.lt;
			let spanSize = (this.data[0].gt - this.data[0].lt)*-1;
			while(selections[1] > highestDataPoint.lt) {
				this.data.push({
					gt: startingPoint + spanSize * i,
					lt: startingPoint + spanSize * (i+1),
					value: -1
				});
				highestDataPoint = this.data[this.data.length-1];
				i++;
			}
		}
		*/

		//Store dataset in respective container depending on if it's filtered or not
		/*
		if($.isEmptyObject(importData.picks)) {
			this.datasets.unfiltered = JSON.parse(JSON.stringify(this.data));
		}
		else {
			this.datasets.filtered = JSON.parse(JSON.stringify(this.data));
			
			if(this.datasets.unfiltered.length == 0) {
				//If we have imported filtered data, but there is not unfiltered version, we need to get it, since we need it for reference when rendering the slider
				console.log("WARN: No unfiltered data in range facet.");
			}
		}
		*/

		//console.log(this.data);


		//let categories = this.makeCategories(this.data);
		//return categories;

		


		//this.numberOfCategories


		/*
		importData.items.sort( (a, b) => {
			if ( a.value < b.value ){
				return -1;
			}
			if ( a.value > b.value ){
				return 1;
			}
			return 0;
		});

		for(var key in importData.items) {
			var item = importData.items[key];

			data.push({
				value: item.value,
				id: item.dataPointId
			});
		}
		
		if(overwrite) {
			this.data = data;
		}
		
		if(importData.items.length == 0) {
			//If this is the case, we may have to consider that there simply are no data here because of overlaying filters - it's just a simple fact of life?
			this.minDataValue = false;
			this.maxDataValue = false;
		}
		else {
			let categories = this.makeCategories(data);

			this.minDataValue = importData.items[0].value;
			this.maxDataValue = importData.items[importData.items.length-1].value;
			
			this.setSelections([categories[0].lowest, categories[categories.length-1].highest]);
		}

		this.renderData(this.data);

		//this.makeCategories(this.getSelections());
		
		return data;
		*/
	}

	/*
	* Function: makeCategories
	*
	* Reduce dataset to number of categories/bars we want. Note that this function will create categories which are somewhat "fuzzy" since the dataset from the server will lack som granularity.
	*/
	makeCategories(data, selections = []) {

		//console.log("makeCategories", selections);

		//Get highest/lowest data values
		let min = null; //Starting value for the categories
		let max = null; //Ending value for the categories
		if(selections.length == 2) {
			min = selections[0];
			max = selections[1];
		}
		else {
			let endpoints = this.getDataEndpoints(data);
			min = endpoints.min;
			max = endpoints.max;
			//min = this.getLowestDataValue(data);
			//max = this.getHighestDataValue(data);
		}

		/*
		console.log("Making categories from/to:");
		console.log(min, max);
		*/
		let categorySize = ((min - max)*-1) / this.numberOfCategories;

		//console.log(categorySize);

		this.categories = [];
		for(let i = 0; i < this.numberOfCategories; i++) {
			this.categories.push({
				gt: min + i * categorySize,
				lt: min + (i+1) * categorySize,
				value: 0
			});
		}

		//Add values to categories
		for(let catKey in this.categories) {
			for(let key in data) {
				if(data[key].lt <= this.categories[catKey].lt && data[key].gt >= this.categories[catKey].gt) {
					this.categories[catKey].value += data[key].value;
				}
			}
		}
		
		//console.log(this.categories);
		return this.categories;
	}

	/*
	* Function: getSelections
	*
	* Returns:
	* The facets selections in a facet-specific format.
	*
	*/
	getSelections() {
		return this.selections;
	}
	
	/*
	* Function: hasSelection
	*
	* Determines whether this facet has any selections or not.
	*
	*/
	hasSelection() {
		if(this.selections.length < 2) {
			return false;
		}
		if(typeof(this.selections[0]) == "undefined" || typeof(this.selections[1]) == "undefined") {
			return false;
		}
		if(this.selections[0] != this.minDataValue || this.selections[1] != this.maxDataValue) {
			return true;
		}
		return false;
	}
	
	/*
	* Function: renderData
	*
	* Renders the chart and the slider. Basically all the content in the facet.
	*/
	renderData(selections = []) {
		//console.log("renderData", this.data, selections);
		if(selections.length == 0) {
			selections = this.getSelections();
		}

		if(this.hasSelection()) {
			this.data = this.hqs.copyObject(this.datasets.filtered);
		}
		else {
			this.data = this.hqs.copyObject(this.datasets.unfiltered);
		}
		


		console.log(this.datasets);


		let categories = this.makeCategories(this.data, selections);


		$(".facet-body > .chart-container", this.getDomRef()).show();
		if(this.chart == null) {
			this.renderChart(categories, selections);
		}
		else {
			this.updateChart(categories, selections);
		}

		if(this.sliderElement == null) {
			this.renderSlider(categories, selections);
		}
		else {
			//this.updateSlider(categories, selections);
		}

		/*
		if(typeof(data) == "undefined") {
			data = this.data;
		}

		if(data.length == 0) {
			$(".facet-body > .chart-container", this.getDomRef()).hide();
			$(".facet-body > .facet-no-data-msg", this.getDomRef()).show();
			return;
		}

		let categories = this.makeCategories(data, selections);

		$(".facet-body > .facet-no-data-msg", this.getDomRef()).hide();
		$(".facet-body > .chart-container", this.getDomRef()).show();
		
		if(this.chart == null) {
			this.renderChart(categories, selections);
		}
		else {
			this.updateChart(categories, selections);
		}
		
		if(this.sliderElement == null) {
			this.renderSlider(categories, selections);
		}
		else {
			this.updateSlider(categories, selections);
		}
		*/
	}

	/*
	 * Function: renderChart
	 *
	 * Renders the chart and only the chart-part of the range facet. Will render whatever is currently in this.data (within selections).
	 */
	renderChart(categories, selections) {

		var chartContainerNode = $(".chart-canvas-container", this.getDomRef());
		$(".range-chart-canvas", chartContainerNode).remove();
		chartContainerNode.append($("<canvas></canvas>").attr("id", "facet_"+this.id+"_canvas").addClass("range-chart-canvas"));

		//this.chartJSDatasets = this.getChartDataWithinLimits();

		let chartJSDatasets = this.makeChartJsDataset(categories);

		this.chartJSOptions = {
			responsive: true,
			maintainAspectRatio: false,
			legend: {
				display: false
			},
			scales: {
				xAxes: [{
					display: true,
					barPercentage: 1.0
				}],
				yAxes: [{
					ticks: {
						beginAtZero:true
					}
				}]
			},
			layout: {
				padding: {
					left: 0,
					right: 0,
					top: 0,
					bottom: 10
				}
			},
			tooltips: {
				displayColors: false
			},
			animation: {
				duration: 0
			}
		};

		var ctx = $("#facet_"+this.id+"_canvas")[0].getContext("2d");
		this.chart = new Chart(ctx, {
			type: "bar",
			data: JSON.parse(JSON.stringify(chartJSDatasets)), //need a copy here - not a reference
			options: this.chartJSOptions
		});
	}

	/*
	 * Function: renderSlider
	 *
	 * Renders the slider and only the slider-part of the range facet.
	 */
	renderSlider(categories, selections) {
		
		let sliderMin = this.categories[0].gt;
		let sliderMax = this.categories[this.categories.length-1].lt;
		
		//console.log(this.getSelections());
		//console.log("Render slider with endpoint values: ", sliderMin, sliderMax);
		

		var rangesliderContainer = $(".rangeslider-container", this.getDomRef())[0];
		this.sliderElement = noUiSlider.create(rangesliderContainer, {
			start: [sliderMin, sliderMax],
			range: {
				'min': sliderMin,
				'max': sliderMax
			},
			//margin: this.categorySpan,
			//step: this.categorySpan,
			step: 1,
			connect: true
		});

		$(".slider-manual-input-container", this.getDomRef()).remove();
		var upperManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='upper']")[0].cloneNode(true);
		var lowerManualInputNode = $("#facet-template .slider-manual-input-container[endpoint='lower']")[0].cloneNode(true);
		
		$("input", upperManualInputNode).val(sliderMax);
		$("input", lowerManualInputNode).val(sliderMin);

		$(".noUi-handle-upper", this.getDomRef()).append(upperManualInputNode);
		$(".noUi-handle-lower", this.getDomRef()).append(lowerManualInputNode);
		
		//Lots of adjustments for setting the right size and position of the digit input boxes depending on how big they need to be
		let digits = sliderMax.toString().length > sliderMin.toString().length ? sliderMax.toString().length : sliderMin.toString().length;
		var digitSpace = digits*5;
		$(".slider-manual-input-container", this.domObj).css("width", 20 + digitSpace);
		$(".range-facet-manual-input", this.domObj).css("width", 18 + digitSpace);
		$(".rangeslider-container", this.domObj).css("margin-left", 18 + digitSpace);
		$(".rangeslider-container", this.domObj).css("margin-right", 18 + digitSpace);
		$(".noUi-handle-lower > .slider-manual-input-container", this.getDomRef()).css("left", Math.round(0-digitSpace)+"px");
		
		$(".slider-manual-input-container", this.getDomRef()).show();
		

		$(".slider-manual-input-container", this.getDomRef()).on("change", (evt) => {
			this.manualInputCallback(evt);
		});
		/*
		$(".slider-manual-input-container", this.getDomRef()).on("focusout", (evt) => {
			console.log("focusout", evt);
		});
		*/
		
		this.sliderElement.off("update");
		this.sliderElement.on("update", (values, slider) => {
			
			let highValue = parseFloat(values[0]);
			let lowValue = parseFloat(values[1]);

			$(".noUi-handle-lower .range-facet-manual-input", this.getDomRef()).val(highValue);
			$(".noUi-handle-upper .range-facet-manual-input", this.getDomRef()).val(lowValue);
		});
		this.sliderElement.on("change", (values, slider) => {
			this.sliderMovedCallback(values, slider);
		});
	}
	
	updateChart(categories, selections) {
		let chartJSDatasets = this.makeChartJsDataset(categories);
		this.chart.data.datasets = chartJSDatasets.datasets;
		this.chart.data.labels = chartJSDatasets.labels;
		this.chart.update();
	}
	
	updateSlider(categories, selections) {
		
		let sliderMax = this.getHighestDataValue(this.data, selections);
		let sliderMin = this.getLowestDataValue(this.data, selections);

		this.sliderElement.updateOptions(
			{
				start: selections,
				/*
				range: {
					'min': sliderMin,
					'max': sliderMax
				},
				*/
				//margin: this.categorySpan,
				//step: this.categorySpan,
			},
			true
		);

		//var chartJSDatasets = this.makeChartJsDataset();
		//var sliderCategories = chartJSDatasets.datasets[0].data.length-1;
		//var selections = this.getSelections();
		
		//console.log(sliderCategories, selections);
		
		//map selections to sliderCategories, I guess?
		

		/*
		var categories = this.translateRealNumbersToSliderCategories(this.getSelections()[0], this.getSelections()[1]);
		this.sliderElement.updateOptions(
			{
				start: [categories.low, categories.high],
				range: {
					'min': 0,
					'max': this.data.length-1
				}
			},
			true
		);
		*/
	}

	getDataEndpoints(data) {
		let min = null;
		let max = null;
		for(let k in data) {
			if(max == null || data[k].lt > max) {
				max = data[k].lt;
			}
			if(min == null || data[k].gt < min) {
				min = data[k].gt;
			}
		}

		return {
			max: max,
			min: min
		};
	}
	
	manualInputCallback(evt) {
		console.log("manualInputCallback");

		var newValues = {
			upper: null,
			lower: null
		};
		
		var endpointMoved = "";
		
		if($(evt.currentTarget).attr("endpoint") == "upper") {
			endpointMoved = "upper";
			newValues.upper = $("input", evt.currentTarget).val();
			newValues.lower = $(".slider-manual-input-container[endpoint='lower'] > input", this.getDomRef()).val();
			newValues.upper = parseFloat(newValues.upper);
			newValues.lower = parseFloat(newValues.lower);
		}
		if($(evt.currentTarget).attr("endpoint") == "lower") {
			endpointMoved = "lower";
			newValues.lower = $("input", evt.currentTarget).val();
			newValues.upper = $(".slider-manual-input-container[endpoint='upper'] > input", this.getDomRef()).val();
			newValues.upper = parseFloat(newValues.upper);
			newValues.lower = parseFloat(newValues.lower);
		}
		
		let dataEndPoints = this.getDataEndpoints(this.datasets.unfiltered);
		console.log(this.datasets, dataEndPoints);

		if(newValues.upper > dataEndPoints.max) {
			console.log("Forcing upper selection to "+dataEndPoints.max+" since that is the data endpoint");
			newValues.upper = dataEndPoints.max;
		}
		if(newValues.lower < dataEndPoints.min) {
			console.log("Forcing lower selection to "+dataEndPoints.min+" since that is the data endpoint");
			newValues.lower = dataEndPoints.min;
		}

		console.log(newValues);

		this.setSelections([newValues.lower, newValues.upper]);
		let categories = this.makeCategories(this.data, this.getSelections());
		this.updateChart(categories, this.getSelections());
		this.updateSlider(categories, this.getSelections());
		
		
		//TBH I'm not sure what this function actually does... or is meant to do...
		//this.updateLimits([newValues.lower, newValues.upper], endpointMoved, "inputbox");
		
		/*
		console.log("MANUAL INPUT DETECTED - BEEP BEEP");


		if($(evt.currentTarget).attr("endpoint") == "upper") {
			newValues.upper = $("input", evt.currentTarget).val();
			if(newValues.upper < this.selections[0]) {
				newValues.upper = this.selections[0]+1;//FIXME: What if above max though?
			}
			//this.setSelections([this.selections[0], newValues.upper]);
			this.updateLimits([this.selections[0], newValues.upper]);
		}
		if($(evt.currentTarget).attr("endpoint") == "lower") {
			newValues.lower = $("input", evt.currentTarget).val();
			if(newValues.lower > this.selections[1]) {
				newValues.lower = this.selections[1]-1; //FIXME: What if below minimum though?
			}
			//this.setSelections([newValues.lower, this.selections[1]]);
			this.updateLimits([newValues.lower, this.selections[1]]);
		}
		*/
		
		/*
		var steps = this.translateSelectionToSliderSteps(this.selections);
		//now, you see here cowboy - translateSelectionToSliderSteps may be unable to do this translation if it can't match up
		//the current selections to any of the pre-generated categories, and that's fine, but what we need to do then
		//is to load a new set of categories based on the current selection
		if(steps === false) {
			console.log("Dude, I just, can't even...");
			//Need to load new categories which will match up with this selection
			this.fetchData();
		}
		else {
			this.sliderElement.set([steps.low, steps.high-1]);
			this.setChartToLimits(this.selections[0], this.selections[1]);
		}
		*/
	}
	
	/*
	* Function: sliderMovedCallback
	*
	*/
	sliderMovedCallback(values, whichSlider) {
		console.log("sliderMovedCallback");

		let highValue = parseFloat(values[0]);
		let lowValue = parseFloat(values[1]);

		this.setSelections([highValue, lowValue]);

		$(".noUi-handle-lower .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[0]);
		$(".noUi-handle-upper .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[1]);

		
		//this.data = this.hqs.copyObject(this.datasets.unfiltered);
		let categories = this.makeCategories(this.data, this.getSelections());
		this.updateChart(categories, this.getSelections());

		return;
		
		var lowSliderCategory = parseInt(values[0]);
		var highSliderCategory = parseInt(values[1]);
		
		//console.log(lowSliderCategory, highSliderCategory)
		
		var sliderDataSelection = this.translateSliderCategoriesToRealNumbers(lowSliderCategory, highSliderCategory);
		//console.log(sliderDataSelection);
		this.setSelections(sliderDataSelection);
		//this.setSelections([lowSliderStep, highSliderStep]);
		
		this.updateChart();
		
		if(slider == 0) {
			//lower slider is being dragged
		}
		if(slider == 1) {
			//upper slider is being dragged
		}
		
		//console.log(this.getSelections());
		
		//Set filter high/low indicators in range facet html
		$(".noUi-handle-lower .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[0]);
		$(".noUi-handle-upper .range-facet-manual-input", this.getDomRef()).val(this.getSelections()[1]);
		
		/*
		var lowerPos = $(".noUi-handle-lower", this.getDomRef())[0].getBoundingClientRect();
		var upperPos = $(".noUi-handle-upper", this.getDomRef())[0].getBoundingClientRect();

		if(upperPos.left > 23 && lowerPos.right > upperPos.left) { //if upperPos.left is 23 the handles have not been properly initialized yet, so ignore calculations
			$(".noUi-handle-upper .slider-manual-input-container", this.getDomRef()).css("left", (-7+((lowerPos.right-upperPos.left)*0.5)));
			$(".noUi-handle-lower .slider-manual-input-container", this.getDomRef()).css("left", (-7-((lowerPos.right-upperPos.left)*0.5)));
		}
		else {
			$(".noUi-handle-upper .slider-manual-input-container", this.getDomRef()).css("left", -7);
			$(".noUi-handle-lower .slider-manual-input-container", this.getDomRef()).css("left", -7);
		}
		*/
		
		//this.setChartToLimits(this.selections[0], this.selections[1]);
		
		
		//Only update the selection if they have actually changed, because this callback will be triggered a lot of times even when the user hasn't touched the handles.
		
		
		var selections = this.getSelections();
		//if(selections[0] != sliderDataSelection[0] || selections[1] != sliderDataSelection[1]) {
		this.setSelections(sliderDataSelection);
		if(this.hasSelection()) {
			clearTimeout(this.fetchTimeout);
			this.fetchTimeout = setTimeout(() => {
				this.broadcastSelection();
			}, 500);
		}
		
		//}
	}
	
	/*
	* Function: getChartDataWithinLimits
	*
	* Tries to get data within the selected span from the locally stored categories.
	* Returns false if the selected span cannot be matched to the locally stored categories.
	* Does not attempt to request new categories.
	*
	 */

	getChartDataWithinLimits(values) {
		/*
		if(values.length < 2) {
			values = [this.minDataValue, this.maxDataValue];
		}

		var dataset = JSON.parse(JSON.stringify(this.makeChartJsDataset(values))); //copy the dataset
		for(let key in dataset) {
			if(dataset[key].value < values[0]) {
				dataset.splice(key, 1);
			}
			if(dataset[key].value > values[1]) {
				dataset.splice(key, 1);
			}
		}

		return dataset;
		*/
	}

	/*
	* Function: renderNoDataMsg
	*/
	renderNoDataMsg(on = true) {
		super.renderNoDataMsg(on);
		if(on) {
			$(this.getDomRef()).find(".chart-container").hide();
		}
		else {
			$(this.getDomRef()).find(".chart-container").show();
		}
	}
	
	
	
	/*
	* Function: translateSliderStepsToDataSelection
	*/
	translateSliderCategoriesToRealNumbers(lowStep, highStep) {
		var selections = [];

		if(typeof(this.data[lowStep]) != "undefined") {
			selections[0] = this.data[lowStep].extent[0];
		}
		else {
			console.log("Couldn't figure out lowStep translation");
			return false;
		}
		
		if(typeof(this.data[highStep]) != "undefined") {
			selections[1] = this.data[highStep].extent[1];
		}
		else {
			console.log("Couldn't figure out highStep translation");
			return false;
		}
		return selections;
	}
	
	translateRealNumbersToSliderCategories(low, high) {
		var steps = {
			low: null,
			high: null
		};
		for(var key in this.data) {
			if(this.data[key].extent[0] == low) {
				steps.low = parseInt(key);
			}
			if(this.data[key].extent[1] == low) {
				//steps.low = parseInt(key);
			}
			if(this.data[key].extent[0] == high) {
				//steps.high = parseInt(key);
				//steps.high++; //Since this is the upper value yet it matches the lower extent, make it match the upper extent - not sure this is needed any longer now that categories are dynamic
			}
			if(this.data[key].extent[1] == high) {
				steps.high = parseInt(key);
				//steps.high++;
			}
		}
		
		if(steps.low == null || steps.high == null) {
			console.log("WARN: Couldn't translate to range slider steps...");
			console.log("Selections: ", selections);
			console.log("Steps: ", steps);
			return false;
		}
		return steps;
	}
	
	/*
	* Function: translateSelectionToSliderSteps
	*/
	translateSelectionToSliderSteps(selections = null) {
		if(selections == null) {
			selections = this.getSelections();
		}
		if(selections.length == 0) {
			return false;
		}
		
		var steps = {
			low: null,
			high: null
		};
		for(var key in this.data) {
			if(this.data[key].extent[0] == selections[0]) {
				steps.low = parseInt(key);
			}
			if(this.data[key].extent[1] == selections[0]) {
				//steps.low = parseInt(key);
			}
			if(this.data[key].extent[0] == selections[1]) {
				//steps.high = parseInt(key);
				//steps.high++; //Since this is the upper value yet it matches the lower extent, make it match the upper extent - not sure this is needed any longer now that categories are dynamic
			}
			if(this.data[key].extent[1] == selections[1]) {
				steps.high = parseInt(key);
				//steps.high++;
			}
		}
		
		if(steps.low == null || steps.high == null) {
			console.log("WARN: Couldn't translate to range slider steps...");
			console.log("Selections: ", selections);
			console.log("Steps: ", steps);
			return false;
		}
		
		return steps;
	}

	getHighestDataValue(data, selections = []) {
		//Assuming the data array is already sorted

		let highestDataValue = this.data[this.data.length-1].lt;

		/*
		if(selections.length == 2) {
			if(highestDataValue > selections[1]) {
				highestDataValue = selections[1];
			}
		}
		*/
		
		return highestDataValue;
	}

	getLowestDataValue(data, selections = []) {
		//Assuming the data array is already sorted

		let lowestDataValue = this.data[0].gt;

		/*
		* Problem here is that we only have a granularity of x, and a selection can probably not be mapped correctly due to a lack of resolution in the underlying data
		* So we always need to do a new fetch whenever a new selection is done, to fetch a new dataset based on the new selection
		*/
		/*
		if(selections.length == 2) {
			if(lowestDataValue < selections[0]) {
				lowestDataValue = selections[0];
			}
		}
		*/
		
		return lowestDataValue;
	}
	
	/*
	 * Function: makeChartJsDataset
	 *
	 * Translates current dataset (in this.data) to the ChartJS format and returns it.
	 */
	makeChartJsDataset(categories) {
		var dataset = [];
		var labels = [];

		let dataSet = []; //chartJS dataset structure

		for(let catKey in categories) {
			dataset.push(categories[catKey].value);
		}

		for(let catKey in categories) {
			let labelLow = categories[catKey].gt;
			let labelHigh = categories[catKey].lt;
			if(Config.rangeFilterFuzzyLabels) {
				labelLow = Math.round(labelLow);
				labelHigh = Math.round(labelHigh);
			}
			labels.push(labelLow+" - "+labelHigh);
		}

		let chartJsObject = {
			labels: labels,
			datasets: [{
				data: dataset,
				backgroundColor: styles.baseColor,
				borderColor: styles.color3
			}]
		};

		return chartJsObject;
	}
	
	/*
	* Function: minimize
	*/
	minimize() {
		super.minimize();
		
		$(".rangeslider-container-wrapper", this.getDomRef()).css("margin-top", "5px").css("margin-bottom", "5px");
		$(".chart-canvas-container", this.getDomRef()).hide();
		$(this.getDomRef()).css("height", "60px");
		$(".facet-body", this.getDomRef()).css("height", "100%").show();
		
		var slotId = this.hqs.facetManager.getSlotIdByFacetId(this.id);
		this.hqs.facetManager.updateSlotSize(slotId);
		this.hqs.facetManager.updateAllFacetPositions();
	}
	
	/*
	* Function: maximize
	*/
	maximize() {
		super.maximize();
		
		$(".rangeslider-container-wrapper", this.getDomRef()).css("margin-top", "0px").css("margin-bottom", "0px");
		$(".chart-canvas-container", this.getDomRef()).show();
		
		var slotId = this.hqs.facetManager.getSlotIdByFacetId(this.id);
		this.hqs.facetManager.updateSlotSize(slotId);
		this.hqs.facetManager.updateAllFacetPositions();
	}

	showLoadingIndicator(on = true, error = false) {
		super.showLoadingIndicator(on, error);
		if(on) {
			$(".chart-container", this.domObj).css("opacity", 0.5);
			//$(".chart-canvas-container", this.domObj).css("filter", "blur(2px)");
		}
		else {
			$(".chart-container", this.domObj).css("opacity", 1.0);
			//$(".chart-canvas-container", this.domObj).css("filter", "none");
		}
	}
}

export { RangeFacet as default }