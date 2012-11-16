'use strict';

/**
 * Provides a declarative structure around interactive D3
 * applications.
 *
 * @module d3-components
 **/

YUI.add('d3-components', function(Y) {
  var ns = Y.namespace('d3'),
      L = Y.Lang;

  var Module = Y.Base.create('Module', Y.Base, [], {
    /**
     * @property events
     * @type {object}
     **/
    events: {
      scene: {},
      d3: {},
      yui: {}
    },

    initializer: function() {
      this.events = Y.merge(this.events);
    }
  }, {
    ATTRS: {
      component: {},
      options: {},
      container: {getter: function() {
        return this.get('component').get('container');}}
    }
  });
  ns.Module = Module;


  var Component = Y.Base.create('Component', Y.Base, [], {
    /**
     * @class Component
     *
     * Component collects modules implementing various portions of an
     * applications functionality in a declarative way. It is designed to allow
     * both a cleaner separation of concerns and the ability to reuse the
     * component in different ways.
     *
     * Component accomplishes these goals by:
     *    - Control how events are bound and unbound.
     *    - Providing patterns for update data cleanly.
     *    - Providing suggestions around updating the interactive portions
     *      of the application.
     *
     * @constructor
     **/
    initializer: function() {
      this.modules = {};
      this.events = {};
    },

    /**
     * @method addModule
     * @chainable
     * @param {Module} ModClassOrInstance bound will be to this.
     * @param {Object} options dict of options set as options attribute on
     * module.
     *
     * Add a Module to this Component. This will bind its events and set up all
     * needed event subscriptions.  Modules can return three sets of events
     * that will be bound in different ways
     *
     *   - scene: {selector: event-type: handlerName} -> YUI styled event
     *            delegation
     *   - d3 {selector: event-type: handlerName} -> Bound using
     *          specialized d3 event handling
     *   - yui {event-type: handlerName} -> collection of global and custom
     *          events the module reacts to.
     **/

    addModule: function(ModClassOrInstance, options) {
      var config = options || {},
          module = ModClassOrInstance,
          modEvents;

      if (!(ModClassOrInstance instanceof Module)) {
        module = new ModClassOrInstance();
      }
      module.setAttrs({
        component: this,
        options: config});

      this.modules[module.name] = module;

      modEvents = module.events;
      this.events[module.name] = modEvents;
      this.bind(module.name);
      return this;
    },

    /**
     * @method removeModule
     * @param {String} moduleName Module name to remove.
     * @chainable
     **/
    removeModule: function(moduleName) {
      this.unbind(moduleName);
      delete this.events[moduleName];
      delete this.modules[moduleName];
      return this;
    },

    /**
     * Internal implementation of
     * binding both
     * Module.events.scene and
     * Module.events.yui.
     **/
    _bindEvents: function(modName) {
      var self = this,
          modEvents = this.events[modName],
          module = this.modules[modName],
          owns = Y.Object.owns,
          container = this.get('container'),
          subscriptions = [],
          handlers,
          handler;

      function _bindEvent(name, handler, container, selector, context) {
        // Adapt between d3 events and YUI delegates.
        var d3Adaptor = function(evt) {
          var selection = d3.select(evt.currentTarget.getDOMNode()),
              d = selection.data()[0];
          // This is a minor violation (extension)
          // of the interface, but suits us well.
          d3.event = evt;
          return handler.call(
              evt.currentTarget.getDOMNode(), d, context);
        };

        subscriptions.push(
            Y.delegate(name, d3Adaptor, container, selector, context));
      }

      // Return a resolved handler object in the form
      // {phase: str, callback: function}
      function _normalizeHandler(handler, module, selector) {
        var result = {};

        if (L.isString(handler)) {
          result.callback = module[handler];
          result.phase = 'on';
        }

        if (L.isObject(handler)) {
          result.phase = handler.phase || 'on';
          result.callback = handler.callback;
        }

        if (L.isString(result.callback)) {
          result.callback = module[result.callback];
        }

        if (!result.callback) {
          console.error('No Event handler for', selector, modName);
          return;
        }
        if (!L.isFunction(result.callback)) {
          console.error('Unable to resolve a proper callback for',
                        selector, handler, modName, result);
          return;
        }
        return result;
      }

      this.unbind(modName);

      // Bind 'scene' events
      Y.each(modEvents.scene, function(handlers, selector, sceneEvents) {
        Y.each(handlers, function(handler, trigger) {
          handler = _normalizeHandler(handler, module, selector);
          if (L.isValue(handler)) {
            _bindEvent(trigger, handler.callback, container, selector, self);
          }
        });
      });

      // Bind 'yui' custom/global subscriptions
      // yui: {str: str_or_function}
      // TODO {str: str/func/obj}
      //       where object includes phase (before, on, after)
      if (modEvents.yui) {
        // Resolve any 'string' handlers to methods on module.
        Y.each(['after', 'before', 'on'], function(eventPhase) {
          var resolvedHandler = {};
          Y.each(modEvents.yui, function(handler, name) {
            handler = _normalizeHandler(handler, module);
            if (!handler || handler.phase !== eventPhase) {
              return;
            }
            resolvedHandler[name] = handler.callback;
          }, this);
          // Bind resolved event handlers as a group.
          if (Y.Object.keys(resolvedHandler).length) {
            subscriptions.push(Y[eventPhase](resolvedHandler));
          }
        });
      }
      return subscriptions;
    },

    /**
     * @method bind
     *
     * Internal. Called automatically by addModule.
     **/
    bind: function(moduleName) {
      var eventSet = this.events,
          filtered = {};

      if (moduleName) {
        filtered[moduleName] = eventSet[moduleName];
        eventSet = filtered;
      }

      Y.each(Y.Object.keys(eventSet), function(name) {
        this.events[name].subscriptions = this._bindEvents(name);
      }, this);
      return this;
    },

    /**
     * Specialized handling of events only found in d3.
     * This is again an internal implementation detail.
     *
     * Its worth noting that d3 events don't use a delegate pattern
     * and thus must be bound to nodes present in a selection.
     * For this reason binding d3 events happens after render cycles.
     *
     * @method _bindD3Events
     * @param {String} modName Module name.
     **/
    _bindD3Events: function(modName) {
      // Walk each selector for a given module 'name', doing a
      // d3 selection and an 'on' binding.
      var modEvents = this.events[modName],
          owns = Y.Object.owns,
          module;
      if (!modEvents || !modEvents.d3) {
        return;
      }
      modEvents = modEvents.d3;
      module = this.modules[modName];

      function _normalizeHandler(handler, module) {
        if (handler && !L.isFunction(handler)) {
          handler = module[handler];
        }
        return handler;
      }

      Y.each(modEvents, function(handlers, selector) {
        Y.each(handlers, function(handler, trigger) {
          handler = _normalizeHandler(handler, module);
          d3.selectAll(selector).on(trigger, handler);
        });
      });
    },

    /**
     * @method _unbindD3Events
     *
     * Internal Detail. Called by unbind automatically.
     * D3 events follow a 'slot' like system. Setting the
     * event to null unbinds existing handlers.
     **/
    _unbindD3Events: function(modName) {
      var modEvents = this.events[modName],
          owns = Y.Object.owns,
          module;

      if (!modEvents || !modEvents.d3) {
        return;
      }
      modEvents = modEvents.d3;
      module = this.modules[modName];

      Y.each(modEvents, function(handlers, selector) {
        Y.each(handlers, function(handler, trigger) {
          d3.selectAll(selector).on(trigger, null);
        });
      });
    },

    /**
     * @method unbind
     * Internal. Called automatically by removeModule.
     **/
    unbind: function(moduleName) {
      var eventSet = this.events,
          filtered = {};

      function _unbind(modEvents) {
        Y.each(modEvents.subscriptions, function(handler) {
          if (handler) {
            handler.detach();
          }
        });
        delete modEvents.subscriptions;
      }

      if (moduleName) {
        filtered[moduleName] = eventSet[moduleName];
        eventSet = filtered;
      }
      Y.each(Y.Object.values(eventSet), _unbind, this);
      // Remove any d3 subscriptions as well.
      this._unbindD3Events();

      return this;
    },

    /**
     * @method render
     * @chainable
     *
     * Render each module bound to the canvas
     */
    render: function() {
      var self = this;
      function renderAndBind(module, name) {
        if (module && module.render) {
          module.render();
        }
        self._bindD3Events(name);
      }

      // If the container isn't bound to the DOM
      // do so now.
      this.attachContainer();
      // Render modules.
      Y.each(this.modules, renderAndBind, this);
      return this;
    },

    /**
     * @method attachContainer
     * @chainable
     *
     * Called by render, conditionally attach container to the DOM if
     * it isn't already. The framework calls this before module
     * rendering so that d3 Events will have attached DOM elements. If
     * your application doesn't need this behavior feel free to override.
     **/
    attachContainer: function() {
      var container = this.get('container');
      if (container && !container.inDoc()) {
        Y.one('body').append(container);
      }
      return this;
    },

    /**
     * @method detachContainer
     *
     * Remove container from DOM returning container. This
     * is explicitly not chainable.
     **/
    detachContainer: function() {
      var container = this.get('container');
      if (container.inDoc()) {
        container.remove();
      }
      return container;
    },

    /**
     *
     * @method update
     * @chainable
     *
     * Update the data for each module
     * see also the dataBinding event hookup
     */
    update: function() {
      Y.each(Y.Object.values(this.modules), function(mod) {
        mod.update();
      });
      return this;
    }
  }, {
    ATTRS: {
      container: {}
    }

  });
  ns.Component = Component;
}, '0.1', {
  'requires': ['d3',
    'base',
    'array-extras',
    'event']});