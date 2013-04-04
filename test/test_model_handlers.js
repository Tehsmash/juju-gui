'use strict';

(function() {

  describe('Juju delta handlers', function() {
    var db, models, handlers, Y;
    var requirements = ['juju-models', 'juju-delta-handlers'];

    before(function(done) {
      Y = YUI(GlobalConfig).use(requirements, function(Y) {
        models = Y.namespace('juju.models');
        handlers = models.handlers;
        done();
      });
    });

    beforeEach(function() {
      db = new models.Database();
    });


    describe('pyDelta handler', function() {
      var pyDelta;

      before(function() {
        pyDelta = handlers.pyDelta;
      });

      it('replaces the attribute names when required', function() {
        var change = {
          id: 'django/1',
          private_address: '10.0.0.1',
          'public-address': 'example.com',
          'is-subordinate': true
        };
        pyDelta(db, 'add', change, 'unit');
        // Retrieve the unit from the database.
        var unit = db.units.getById('django/1');
        assert.strictEqual('10.0.0.1', unit.private_address);
        assert.strictEqual('example.com', unit.public_address);
        assert.isTrue(unit.is_subordinate);
      });

      it('automatically handles changes to different model lists', function() {
        pyDelta(db, 'add', {id: 'django'}, 'service');
        pyDelta(db, 'add', {id: 'django/1'}, 'unit');
        pyDelta(db, 'add', {id: '1'}, 'machine');
        assert.strictEqual(1, db.services.size());
        assert.strictEqual(1, db.units.size());
        assert.strictEqual(1, db.machines.size());
        assert.isNotNull(db.services.getById('django'));
        assert.isNotNull(db.units.getById('django/1'));
        assert.isNotNull(db.machines.getById('1'));
      });

    });


    describe('unitInfo handler', function() {
      var unitInfo;

      before(function() {
        unitInfo = handlers.unitInfo;
      });

      it('creates a unit in the database', function() {
        var change = {
          Name: 'django/1',
          Service: 'django',
          MachineId: '1',
          Status: 'pending',
          PublicAddress: 'example.com',
          PrivateAddress: '10.0.0.1'
          // XXX 2013-04-03 frankban: include change.Ports.
        };
        unitInfo(db, 'add', change);
        assert.strictEqual(1, db.units.size());
        // Retrieve the unit from the database.
        var unit = db.units.getById('django/1');
        assert.strictEqual('django', unit.service);
        assert.strictEqual('1', unit.machine);
        assert.strictEqual('pending', unit.agent_state);
        assert.strictEqual('example.com', unit.public_address);
        assert.strictEqual('10.0.0.1', unit.private_address);
      });

      it('updates a unit in the database', function() {
        db.units.add({
          id: 'django/2',
          agent_state: 'pending',
          public_address: 'example.com',
          private_address: '10.0.0.1'
        });
        var change = {
          Name: 'django/2',
          Status: 'started',
          PublicAddress: 'example.com',
          PrivateAddress: '192.168.0.1'
        };
        unitInfo(db, 'change', change);
        assert.strictEqual(1, db.units.size());
        // Retrieve the unit from the database.
        var unit = db.units.getById('django/2');
        assert.strictEqual('started', unit.agent_state);
        assert.strictEqual('example.com', unit.public_address);
        assert.strictEqual('192.168.0.1', unit.private_address);
      });

      it('creates or updates the corresponding machine', function() {
        var machine;
        var change = {
          Name: 'django/2',
          MachineId: '1',
          Status: 'pending',
          PublicAddress: 'example.com'
        };
        unitInfo(db, 'add', change);
        assert.strictEqual(1, db.machines.size());
        // Retrieve the machine from the database.
        machine = db.machines.getById(1);
        assert.strictEqual('pending', machine.agent_state);
        assert.strictEqual('pending', machine.instance_state);
        assert.strictEqual('example.com', machine.public_address);
        // Update the machine.
        change.Status = 'started';
        unitInfo(db, 'change', change);
        assert.strictEqual(1, db.machines.size());
        // Retrieve the machine from the database (again).
        machine = db.machines.getById('1');
        assert.strictEqual('started', machine.agent_state);
        assert.strictEqual('started', machine.instance_state);
      });

    });


    describe('serviceInfo handler', function() {
      var serviceInfo;

      before(function() {
        serviceInfo = handlers.serviceInfo;
      });

      it('creates a service in the database', function() {
        var change = {
          Name: 'django',
          CharmURL: 'cs:precise/django-42',
          Exposed: true
        };
        serviceInfo(db, 'add', change);
        assert.strictEqual(1, db.services.size());
        // Retrieve the service from the database.
        var service = db.services.getById('django');
        assert.strictEqual('cs:precise/django-42', service.get('charm'));
        assert.isTrue(service.get('exposed'));
      });

      it('updates a service in the database', function() {
        db.services.add({
          id: 'wordpress',
          charm: 'cs:quantal/wordpress-11',
          exposed: true
        });
        var change = {
          Name: 'wordpress',
          CharmURL: 'cs:quantal/wordpress-11',
          Exposed: false
        };
        serviceInfo(db, 'change', change);
        assert.strictEqual(1, db.services.size());
        // Retrieve the service from the database.
        var service = db.services.getById('wordpress');
        assert.strictEqual('cs:quantal/wordpress-11', service.get('charm'));
        assert.isFalse(service.get('exposed'));
      });

    });


    describe('relationInfo handler', function() {
      var relationInfo;

      before(function() {
        relationInfo = handlers.relationInfo;
      });

      it('creates a relation in the database', function() {
        var change = {
          Key: 'relation-042'
          // XXX 2013-04-03 frankban: include change.Endpoints.
        };
        relationInfo(db, 'add', change);
        assert.strictEqual(1, db.relations.size());
        // Retrieve the relation from the database.
        var relation = db.relations.getById('relation-042');
        assert.isNotNull(relation);
      });

    });


    describe('machineInfo handler', function() {
      var machineInfo;

      before(function() {
        machineInfo = handlers.machineInfo;
      });

      it('creates a machine in the database', function() {
        var change = {
          Id: '1',
          InstanceId: 'my-machine-instance'
        };
        machineInfo(db, 'add', change);
        assert.strictEqual(1, db.machines.size());
        // Retrieve the machine from the database.
        var machine = db.machines.getById('1');
        assert.strictEqual('my-machine-instance', machine.instance_id);
      });

      it('updates a machine in the database', function() {
        db.machines.add({
          id: '2',
          instance_id: 'instance-42'
        });
        var change = {
          Id: '2',
          InstanceId: 'instance-47'
        };
        machineInfo(db, 'change', change);
        assert.strictEqual(1, db.machines.size());
        // Retrieve the machine from the database.
        var machine = db.machines.getById('2');
        assert.strictEqual('instance-47', machine.instance_id);
      });

    });


    describe('annotationInfo handler', function() {
      var annotationInfo;

      before(function() {
        annotationInfo = handlers.annotationInfo;
      });

      it('stores annotations on a service', function() {
        db.services.add({id: 'django'});
        var annotations = {'gui-x': '42', 'gui-y': '47'};
        var change = {
          Tag: 'service-django',
          Annotations: annotations
        };
        annotationInfo(db, 'add', change);
        // Retrieve the annotations from the database.
        var service = db.services.getById('django');
        assert.deepEqual(annotations, service.get('annotations'));
      });

      it('stores annotations on a unit', function() {
        db.units.add({id: 'django/2'});
        var annotations = {'foo': '42', 'bar': '47'};
        var change = {
          Tag: 'unit-django-2',
          Annotations: annotations
        };
        annotationInfo(db, 'add', change);
        // Retrieve the annotations from the database.
        var unit = db.units.getById('django/2');
        assert.deepEqual(annotations, unit.annotations);
      });

      it('stores annotations on a machine', function() {
        db.machines.add({id: '1'});
        var annotations = {'foo': '42', 'bar': '47'};
        var change = {
          Tag: 'machine-1',
          Annotations: annotations
        };
        annotationInfo(db, 'add', change);
        // Retrieve the annotations from the database.
        var machine = db.machines.getById('1');
        assert.deepEqual(annotations, machine.annotations);
      });

      it('stores annotations on the environment', function() {
        var annotations = {'foo': '42', 'bar': '47'};
        var change = {
          Tag: 'environment-foo',
          Annotations: annotations
        };
        annotationInfo(db, 'add', change);
        // Retrieve the annotations from the database.
        assert.deepEqual(annotations, db.environment.get('annotations'));
      });

      it('correctly updates annotations', function() {
        var initial = {'gui-x': '42'},
            expected = {'gui-y': '47', 'gui-z': 'Now in 3D!'};
        db.services.add({id: 'django', annotations: initial});
        var change = {
          Tag: 'service-django',
          Annotations: expected
        };
        annotationInfo(db, 'change', change);
        // Retrieve the annotations from the database.
        var service = db.services.getById('django');
        assert.deepEqual(expected, service.get('annotations'));
      });

    });

  });


  describe('Juju delta handlers utilities', function() {
    var utils, Y;

    before(function(done) {
      Y = YUI(GlobalConfig).use(['juju-delta-handlers'], function(Y) {
        utils = Y.namespace('juju.models').utils;
        done();
      });
    });


    describe('Go Juju Entity Tag cleaner', function() {
      var cleanUpEntityTags;

      before(function() {
        cleanUpEntityTags = utils.cleanUpEntityTags;
      });

      it('cleans up tags from Go juju', function() {
        assert.equal('mysql', cleanUpEntityTags('service-mysql'));
        assert.equal('mysql-0', cleanUpEntityTags('unit-mysql-0'));
        assert.equal('0', cleanUpEntityTags('machine-0'));
        assert.equal('aws', cleanUpEntityTags('environment-aws'));
      });

      it('ignores bad values', function() {
        var data = ['foo', 'bar-baz', '123'];
        Y.each(data, function(item) {
          assert.equal(item, cleanUpEntityTags(item));
        });
      });

    });

  });

})();