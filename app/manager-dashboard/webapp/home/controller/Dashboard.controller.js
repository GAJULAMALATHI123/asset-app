sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/ui/core/routing/HashChanger"
], function (Controller, JSONModel, MessageToast, MessageBox, HashChanger) {
  "use strict";

  var STATUS_LABELS = {
    AVAILABLE: "Available",
    ASSIGNED: "Assigned",
    MAINTENANCE: "Under Maintenance",
    IN_MAINTENANCE: "Under Maintenance",
    RETIRED: "Retired",
    ARCHIVED: "Archived"
  };

  function groupCount(rows, field, limit) {
    var counts = Object.create(null);
    rows.forEach(function (row) {
      var key = row[field] || "Not specified";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.keys(counts).map(function (key) {
      return { label: key, count: counts[key] };
    }).sort(function (a, b) {
      return b.count - a.count || a.label.localeCompare(b.label);
    }).slice(0, limit || 6);
  }

  function withPercent(rows) {
    var max = rows.reduce(function (value, row) { return Math.max(value, row.count); }, 0);
    return rows.map(function (row) {
      row.percent = max ? Math.max(4, Math.round(row.count * 100 / max)) : 0;
      return row;
    });
  }

  return Controller.extend("managerdashboard.home.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        kpis: { total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0, archived: 0 },
        statusRows: [],
        departmentRows: [],
        locationRows: [],
        categoryRows: [],
        maintenance: { open: 0, inProgress: 0, completed: 0 },
        requests: { pending: 0 },
        lastUpdated: "Loading live asset data…"
      }), "dash");
      this.loadDashboard();
    },

    loadList: function (path) {
      var model = this.getOwnerComponent().getModel();
      return model.bindList(path).requestContexts(0, 1000).then(function (contexts) {
        return contexts.map(function (context) { return context.getObject(); });
      });
    },

    loadDashboard: function () {
      var view = this.getView();
      view.setBusy(true);
      return Promise.all([
        this.loadList("/AssetFacts"),
        this.loadList("/MaintenanceRecords"),
        this.loadList("/AssetRequests")
      ]).then(function (results) {
        var assets = results[0];
        var maintenance = results[1];
        var requests = results[2];
        var statusCounts = Object.create(null);
        assets.forEach(function (asset) {
          var status = String(asset.status || "UNKNOWN").toUpperCase();
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        var available = statusCounts.AVAILABLE || 0;
        var assigned = statusCounts.ASSIGNED || 0;
        var inMaintenance = (statusCounts.MAINTENANCE || 0) + (statusCounts.IN_MAINTENANCE || 0);
        var retired = statusCounts.RETIRED || 0;
        var archived = statusCounts.ARCHIVED || 0;
        var statusRows = Object.keys(statusCounts).map(function (key) {
          return {
            label: STATUS_LABELS[key] || key.replace(/_/g, " "),
            count: statusCounts[key],
            state: key === "AVAILABLE" ? "Success" :
              (key === "MAINTENANCE" || key === "IN_MAINTENANCE" ? "Warning" :
                (key === "RETIRED" || key === "ARCHIVED" ? "Error" : "Information"))
          };
        }).sort(function (a, b) { return b.count - a.count; });

        var maintenanceCounts = { open: 0, inProgress: 0, completed: 0 };
        maintenance.forEach(function (record) {
          var status = String(record.status || "").toUpperCase().replace(/[ -]/g, "_");
          if (status === "OPEN" || status === "PENDING") { maintenanceCounts.open += 1; }
          else if (status === "IN_PROGRESS" || status === "INPROGRESS") { maintenanceCounts.inProgress += 1; }
          else if (status === "COMPLETED" || status === "CLOSED" || status === "RESOLVED") { maintenanceCounts.completed += 1; }
        });
        var pendingRequests = requests.filter(function (request) {
          return String(request.status || "").toUpperCase() === "PENDING";
        }).length;

        var model = this.getView().getModel("dash");
        model.setData({
          kpis: {
            total: assets.length,
            available: available,
            assigned: assigned,
            maintenance: inMaintenance,
            retired: retired,
            archived: archived
          },
          statusRows: withPercent(statusRows),
          departmentRows: withPercent(groupCount(assets, "department", 6)),
          locationRows: withPercent(groupCount(assets, "location", 6)),
          categoryRows: groupCount(assets, "category", 8),
          maintenance: maintenanceCounts,
          requests: { pending: pendingRequests },
          lastUpdated: "Last updated " + new Date().toLocaleString()
        });
      }.bind(this)).catch(function (error) {
        MessageBox.error("The Manager Dashboard could not load live data. Please check the Manager OData service and try refreshing. " +
          (error && error.message ? error.message : ""));
      }).finally(function () {
        view.setBusy(false);
      });
    },

    onRefresh: function () {
      this.loadDashboard().then(function () { MessageToast.show("Dashboard refreshed"); });
    },

    navigate: function (hash) {
      HashChanger.getInstance().setHash(hash);
    },

    onOpenAssets: function () { this.navigate("Assets"); },
    onOpenMaintenance: function () { this.navigate("MaintenanceRecords"); },
    onOpenRequests: function () { this.navigate("AssetRequests"); },
    onOpenAttention: function () { this.navigate("Attention"); }
  });
});
