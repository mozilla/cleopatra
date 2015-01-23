QUnit.test("Cleopatra Simple Profile", function(assert) {
  loadCleopatra({
    query: "?report=1af8b3634507afe71fdd7a4902aca0d50cc20223",
    assert: assert,
    testFunc: function(cleopatraDocument) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.equal(cleopatraObj.window.gNumSamples, 174, "Loaded profile");
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
      assert.equal(cleopatraObj.window.gNumSamples, 558, "Loaded profile");
    },
  });
});

QUnit.test("Cleopatra Zip (Talos) Profile", function(assert) {
  loadCleopatra({
    query: "?zippedProfile=http://mozilla-releng-blobs.s3.amazonaws.com/blobs/Try-Non-PGO/sha512/02ce11479d9a0c03eee146c9ff18010e9eca892dd9b3ab92eed40f07fcb295a1c4a2e5ed317bbf784e0363f4f3630c4cb7117e7522e21c6d2b48fb469ed68cd5&pathInZip=profile_tresize/tresize/cycle_7.sps",
    assert: assert,
    testFunc: function(cleopatraObj) {
    },
    profileLoadFunc: function(cleopatraObj) {
      assert.equal(cleopatraObj.window.gNumSamples, 2646, "Loaded profile");
    },
  });
});
