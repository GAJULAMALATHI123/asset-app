sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"managerdashboard/test/integration/pages/AssetFactsList.gen",
	"managerdashboard/test/integration/pages/AssetFactsObjectPage.gen"
], function (JourneyRunner, AssetFactsListGenerated, AssetFactsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('managerdashboard') + '/test/flp.html#app-preview',
        pages: {
			onTheAssetFactsListGenerated: AssetFactsListGenerated,
			onTheAssetFactsObjectPageGenerated: AssetFactsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

