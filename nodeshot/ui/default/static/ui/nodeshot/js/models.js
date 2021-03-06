(function() {
    'use strict';

    Ns.models = {};
    Ns.collections = {};

    Ns.models.Base = Backbone.Model.extend({
        url: function () {
            var origUrl = Backbone.Model.prototype.url.call(this);
            return origUrl + (origUrl.charAt(origUrl.length - 1) === '/' ? '' : '/');
        }
    });

    Ns.models.Geo = Backbone.Model.extend({
        idAttribute: 'slug',
        leafletOptions: Ns.settings.leafletOptions,

        initialize: function () {
            this.set('legend', Ns.db.legend.get(this.get('status')));
            this.set('leaflet', this.toLeaflet());
        },

        toLeaflet: function () {
            var options = this.leafletOptions,
            legend = this.get('legend').toJSON();
            return L.geoJson(this.toGeoJSON(), {
                style: function (feature) {
                    options.fillColor = legend.fill_color;
                    options.stroke = legend.stroke_width > 0;
                    options.weight = legend.stroke_width;
                    options.color = legend.stroke_color;
                    options.className = 'marker-' + legend.slug;
                    return options;
                },
                // used only for points
                pointToLayer: function (feature, latlng) {
                    return L.circleMarker(latlng, options);
                }
            }).getLayers()[0];  // GeometryCollection objects not supported!
        },

        /*
        * converts a GeoJSON object into a flat object
        */
        parse: function (geojson) {
            var obj = geojson.properties;
            obj.slug = geojson.id;
            obj.geometry = geojson.geometry;
            return obj;
        },

        /*
        * returns a GeoJSON object
        */
        toGeoJSON: function () {
            var json = this.toJSON(),
            // prepare main keys
            geojson = {
                'type': 'Feature',
                'id': json.slug,
                'geometry': json.geometry
            };
            delete(json.geometry);
            // move rest into properties
            geojson.properties = json;
            // return geojson
            return geojson;
        }
    });

    Ns.collections.Geo = Backbone.Collection.extend({
        _url: Ns.url('layers/:slug/nodes.geojson'),
        model: Ns.models.Geo,

        /*
        * adds slug to object attributes
        */
        fetch: function (options) {
            options = $.extend({
                slug: this.slug
            }, options);
            this.slug = options.slug;
            // Call Backbone's fetch
            return Backbone.Collection.prototype.fetch.call(this, options);
        },

        /*
        * like Backbone.Collection.prototype.where but returns collection
        */
        whereCollection: function (options) {
            return new Ns.collections.Geo(this.where(options));
        },

        /*
        * determine url depending on slug attribute
        */
        url: function () {
            return this._url.replace(':slug', this.slug);
        },

        /*
        * parse geojson
        */
        parse: function (response) {
            return response.features;
        },

        /*
        * returns a pesudo GeoJSON object (leaflet compatible)
        */
        toGeoJSON: function () {
            return this.map(function (model) {
                return model.toGeoJSON();
            });
        }
    });

    Ns.models.Legend = Backbone.Model.extend({
        idAttribute: 'slug',
        defaults: {
            'count': '',
            'visible': true
        },

        initialize: function () {
            var hiddenGroups = localStorage.getObject('hiddenGroups', []);
            if (_.include(hiddenGroups, this.get('slug'))) {
                this.set('visible', false);
            }
            this.on('change:visible', this.storeHidden);
        },

        /**
        * remember hidden legend groups
        */
        storeHidden: function (legend, visible) {
            var hiddenGroups = localStorage.getObject('hiddenGroups', []);
            if (visible) {
                hiddenGroups = _.without(hiddenGroups, legend.id);
            }
            else {
                hiddenGroups = _.union(hiddenGroups, [legend.id]);
            }
            localStorage.setObject('hiddenGroups', hiddenGroups);
        }
    });

    Ns.collections.Legend = Backbone.Collection.extend({
        url: Ns.url('status/'),
        model: Ns.models.Legend
    });

    Ns.models.Layer = Ns.models.Base.extend({
        urlRoot: Ns.url('layers/'),
        idAttribute: 'slug',

        defaults: {
            'visible': true
        },

        initialize: function () {
            var hiddenLayers = localStorage.getObject('hiddenLayers', []);
            if (_.include(hiddenLayers, this.get('slug'))) {
                this.set('visible', false);
            }
            this.on('change:visible', this.storeHidden);
        },

        /**
        * remember hidden legend groups
        */
        storeHidden: function (layer, visible) {
            var hiddenLayers = localStorage.getObject('hiddenLayers', []);
            if (visible) {
                hiddenLayers = _.without(hiddenLayers, layer.id);
            }
            else {
                hiddenLayers = _.union(hiddenLayers, [layer.id]);
            }
            localStorage.setObject('hiddenLayers', hiddenLayers);
        }
    });

    Ns.collections.Layer = Backbone.Collection.extend({
        url: Ns.url('layers/'),
        model: Ns.models.Layer
    });

    Ns.models.Page = Ns.models.Base.extend({
        urlRoot: Ns.url('pages/'),
        idAttribute: 'slug'
    });

    Ns.models.Node = Ns.models.Base.extend({
        urlRoot: Ns.url('nodes/'),
        idAttribute: 'slug',

        defaults: {
            'relationships': false
        }
    });

    Ns.collections.Node = Backbone.PageableCollection.extend({
        model: Ns.models.Node,
        url: Ns.url('nodes/'),

        // Any `state` or `queryParam` you override in a subclass will be merged with
        // the defaults in `Backbone.PageableCollection` 's prototype.
        state: {
            pageSize: 50,
            firstPage: 1,
            currentPage: 1
        },

        queryParams: {
            currentPage: 'page',
            pageSize: 'limit',
            totalRecords: 'count'
        },

        hasNextPage: function () {
            return this.next !== null;
        },

        hasPreviousPage: function () {
            return this.previous !== null;
        },

        getNumberOfPages: function () {
            var total = this.count,
            size = this.state.pageSize;

            return Math.ceil(total / size);
        },

        search: function (q) {
            this.searchTerm = q;
            return this.getPage(1, {
                data: { search: q },
                processData: true
            });
        },

        // needed to use pagination results as the collection
        parse: function (response) {
            this.count = response.count;
            this.next = response.next;
            this.previous = response.previous;
            return response.results;
        },

        initialize: function () {
            this.searchTerm = '';
        }
    });

    Ns.models.User = Ns.models.Base.extend({
        urlRoot: Ns.url('profiles/'),
        idAttribute: 'username',

        defaults: {
            'avatar': 'http://www.gravatar.com/avatar/default'
        },

        initialize: function () {
            this.setTruncatedUsername();
            this.on('change:username', this.setTruncatedUsername);
        },

        /*
        * truncate long usernames
        */
        setTruncatedUsername: function () {
            var username = this.get('username');
            // if username is present and longer than 15
            if (typeof (username) !== 'undefined' && username.length > 15) {
                // add an ellipsis if username is too long
                username = username.substr(0, 13) + '&hellip;';
            }
            // update model
            this.set('truncatedUsername', username);
        },

        /*
        * returns true if the user is authenticated, false otherwise
        */
        isAuthenticated: function () {
            return this.get('username') !== undefined;
        },

        /*
        * performs login
        */
        login: function (data) {
            var self = this;
            // trigger login event
            self.trigger('login');
            // Login
            $.post(Ns.url('account/login/'), data).error(function (http) {
                // TODO improve
                var json = http.responseJSON,
                errorMessage = 'Invalid username or password',
                zIndex = $('#signin-modal').css('z-index'); // original z-index
                $('#signin-modal').css('z-index', 1002); // temporarily change

                // determine correct error message to show
                errorMessage = json.non_field_errors || json.detail ||  errorMessage;

                $.createModal({
                    message: errorMessage,
                    successAction: function () {
                        $('#signin-modal').css('z-index', zIndex);
                    } // restore z-index
                });
            }).done(function (response) {
                $('#signin-modal').modal('hide');
                // load new user
                Ns.db.user.set(response.user);
                // trigger custom event
                self.trigger('loggedin');
            });
        },

        /*
        * performs logout
        */
        logout: function () {
            var self = this;
            self.clear();
            self.trigger('logout');

            $.post(Ns.url('account/logout/')).error(function () {
                // TODO: improve!
                $.createModal({
                    message: 'problem while logging out'
                });
            }).done(function () {
                // trigger custom event
                self.trigger('loggedout');
            });
        }
    });

    Ns.models.Notification = Ns.models.Base.extend({
        urlRoot: Ns.url('account/notifications/'),

        initialize: function () {
            this.setIcon();
        },

        /*
        * use type attribute to differentiate icons
        */
        setIcon: function () {
            var value = this.get('type').split('_')[0];
            this.set('icon', value);
        }
    });

    Ns.collections.Notification = Backbone.Collection.extend({
        model: Ns.models.Notification,
        url: Ns.url('account/notifications/?action=all&limit=15'),

        // needed to use pagination results as the collection
        parse: function (response) {
            return response.results;
        },

        /*
        * get number of unread notifications
        */
        getUnreadCount: function () {
            var count = 0;
            this.models.forEach(function (model) {
                if (model.get('is_read') === false) {
                    count += 1;
                }
            });
            return count;
        },

        /*
        * mark notifications as read
        */
        read: function () {
            // skip if all notifications are already read
            if (this.getUnreadCount() > 0) {
                $.get(this.url.split('?')[0]);
                this.models.forEach(function (model) {
                    model.set('is_read', true);
                });
                this.trigger('reset');
            }
        }
    });

    Ns.collections.Menu = Backbone.Collection.extend({
        model: Backbone.Model,
        url: Ns.url('menu/')
    });
}());
