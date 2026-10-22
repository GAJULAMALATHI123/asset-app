sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"adminasset/test/integration/pages/AssetsList.gen",
	"adminasset/test/integration/pages/AssetsObjectPage.gen"
], function (JourneyRunner, AssetsListGenerated, AssetsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('adminasset') + '/test/flp.html#app-preview',
        pages: {
			onTheAssetsListGenerated: AssetsListGenerated,
			onTheAssetsObjectPageGenerated: AssetsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

