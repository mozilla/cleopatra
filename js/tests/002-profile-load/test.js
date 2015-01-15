QUnit.test("Cleopatra Simple Profile", function(assert) {
  loadCleopatra({
    query: "?report=1af8b3634507afe71fdd7a4902aca0d50cc20223",
    assert: assert,
    testFunc: function(cleopatraDocument) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.ok(cleopatraObj.window.gNumSamples === 174, "Loaded profile");
    },
  });
});

QUnit.test("Cleopatra Complex Profile", function(assert) {
  loadCleopatra({
    query: "?report=4c013822c9b91ffdebfbe6b9ef300adec6d5a99f",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.ok(cleopatraObj.window.gNumSamples === 558, "Loaded profile");
    },
  });
});
