QUnit.test("Cleopatra load", function(assert) {
  loadCleopatra({
    query: "?report=4c013822c9b91ffdebfbe6b9ef300adec6d5a99f",
    assert: assert,
    testFunc: function(cleopatraDocument) {
    },
    profileLoadFunc: function(cleopatraDocument) {
      assert.ok(true, "Loaded profile");
    },
  });
});

