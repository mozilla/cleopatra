QUnit.test("Cleopatra load", function(assert) {
  loadCleopatra({
    assert: assert,
    testFunc: function(cleopatraDocument) {
      // Look for the basic elements of the apge
      assert.ok("Cleopatra - UI for SPS" === cleopatraDocument.title, "Check title");
      assert.ok(cleopatraDocument.getElementById("datafile"), "Has upload field");
      assert.ok(cleopatraDocument.getElementById("data"), "Has paste field");
      assert.ok(cleopatraDocument.getElementById("parse"), "Has parse button");
    }
  });
});
