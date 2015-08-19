/*
    A Mithril.js plugin to authenticate requests against PostgREST
    Copyright (c) 2007 - 2015 Diogo Biazus
    Licensed under the MIT license 
    Version: 1.0.5
*/
!function(factory) {
    "object" == typeof exports ? factory(require("mithril"), require("underscore"), require("node-localstorage")) : factory(window.m, window._, window.localStorage);
}(function(m, _, localStorage) {
    var postgrest = {}, token = function(token) {
        return token ? localStorage.setItem("postgrest.token", token) : localStorage.getItem("postgrest.token");
    }, mergeConfig = function(config, options) {
        return options && _.isFunction(options.config) ? _.compose(options.config, config) : config;
    }, addHeaders = function(headers) {
        return function(xhr) {
            return _.each(headers, function(value, key) {
                xhr.setRequestHeader(key, value);
            }), xhr;
        };
    }, addRepresentationHeader = addHeaders({
        Prefer: "return=representation"
    });
    postgrest.reset = function() {
        localStorage.removeItem("postgrest.token");
    }, postgrest.loader = function(defaultState, requestFunction, options) {
        var loader = m.prop(defaultState), d = m.deferred();
        return loader.load = function() {
            return loader(!0), requestFunction(_.extend({}, options, {
                background: !0
            })).then(function(data) {
                loader(!1), d.resolve(data), m.redraw();
            }, function(error) {
                loader(!1), d.reject(error), m.redraw();
            }), d.promise;
        }, loader;
    }, postgrest.init = function(apiPrefix, authenticationOptions) {
        return postgrest.onAuthFailure = m.prop(function() {}), postgrest.request = function(options) {
            return m.request(_.extend({}, options, {
                url: apiPrefix + options.url
            }));
        }, postgrest.authenticate = function() {
            var deferred = m.deferred();
            return token() ? (deferred.resolve({
                token: token()
            }), deferred.promise) : m.request(authenticationOptions).then(function(data) {
                token(data.token);
            }, postgrest.onAuthFailure());
        }, postgrest.requestWithToken = function(options) {
            var addAuthorizationHeader = addHeaders({
                Authorization: "Bearer " + token()
            });
            return m.postgrest.authenticate().then(function() {
                return m.postgrest.request(_.extend({}, options, {
                    config: mergeConfig(addAuthorizationHeader, options)
                }));
            });
        }, postgrest.model = function(name) {
            var addPaginationHeaders = function(page, pageSize) {
                var toRange = function() {
                    var from = (page - 1) * pageSize, to = from + pageSize - 1;
                    return from + "-" + to;
                };
                return addHeaders({
                    "Range-unit": "items",
                    Range: toRange()
                });
            }, pageSize = m.prop(10), nameOptions = {
                url: "/" + name
            }, getOptions = function(data, page, pageSize, options) {
                return _.extend({}, options, nameOptions, {
                    method: "GET",
                    data: data,
                    config: mergeConfig(addPaginationHeaders(page, pageSize), options)
                });
            }, querystring = function(filters, options) {
                return options.url += "?" + m.route.buildQueryString(filters), options;
            }, options = function(options) {
                return m.postgrest.request(_.extend({}, options, nameOptions, {
                    method: "OPTIONS"
                }));
            }, postOptions = function(attributes, options) {
                return _.extend({}, options, nameOptions, {
                    method: "POST",
                    data: attributes,
                    config: mergeConfig(addRepresentationHeader, options)
                });
            }, deleteOptions = function(filters, options) {
                return querystring(filters, _.extend({}, options, nameOptions, {
                    method: "DELETE"
                }));
            }, patchOptions = function(filters, attributes, options) {
                return querystring(filters, _.extend({}, options, nameOptions, {
                    method: "PATCH",
                    data: attributes,
                    config: mergeConfig(addRepresentationHeader, options)
                }));
            }, getPageOptions = function(page, data, options) {
                return getOptions(data, page, pageSize(), options);
            }, getRowOptions = function(data, options) {
                return getOptions(data, 1, 1, options);
            };
            return {
                pageSize: pageSize,
                getPageOptions: getPageOptions,
                getRowOptions: getRowOptions,
                patchOptions: patchOptions,
                postOptions: postOptions,
                deleteOptions: deleteOptions,
                getPage: _.compose(postgrest.request, getPageOptions),
                getRow: _.compose(postgrest.request, getRowOptions),
                patch: _.compose(postgrest.request, patchOptions),
                post: _.compose(postgrest.request, postOptions),
                deleteRequest: _.compose(postgrest.request, deleteOptions),
                getPageWithToken: _.compose(postgrest.requestWithToken, getPageOptions),
                getRowWithToken: _.compose(postgrest.requestWithToken, getRowOptions),
                patchWithToken: _.compose(postgrest.requestWithToken, patchOptions),
                postWithToken: _.compose(postgrest.requestWithToken, postOptions),
                deleteWithToken: _.compose(postgrest.requestWithToken, deleteOptions),
                options: options
            };
        }, postgrest;
    }, m.postgrest = postgrest;
}), function(factory) {
    "object" == typeof exports ? factory(require("mithril"), require("underscore")) : factory(window.m, window._);
}(function(m, _) {
    m.postgrest.filtersVM = function(attributes) {
        var filter = function() {
            var prop = m.prop("");
            return prop.toFilter = function() {
                return (prop() || "").toString().trim();
            }, prop;
        }, getters = _.reduce(attributes, function(memo, operator, attr) {
            return "between" === operator ? memo[attr] = {
                lte: filter(),
                gte: filter()
            } : memo[attr] = filter(), memo;
        }, {
            order: m.prop()
        }), parametersWithoutOrder = function() {
            return _.reduce(getters, function(memo, getter, attr) {
                if ("order" !== attr) {
                    var operator = attributes[attr];
                    if (_.isFunction(getter) && !getter()) return memo;
                    if ("ilike" === operator || "like" === operator) memo[attr] = operator + ".*" + getter.toFilter() + "*"; else if ("@@" === operator) memo[attr] = operator + "." + getter.toFilter().replace(/\s+/g, "&"); else if ("between" === operator) {
                        if (!getter.lte.toFilter() && !getter.gte.toFilter()) return memo;
                        memo[attr] = [], getter.gte() && memo[attr].push("gte." + getter.gte.toFilter()), 
                        getter.lte() && memo[attr].push("lte." + getter.lte.toFilter());
                    } else memo[attr] = operator + "." + getter.toFilter();
                }
                return memo;
            }, {});
        }, parameters = function() {
            var order = function() {
                return getters.order() && _.reduce(getters.order(), function(memo, direction, attr) {
                    return memo.push(attr + "." + direction), memo;
                }, []).join(",");
            }, orderParameter = order() ? {
                order: order()
            } : {};
            return _.extend({}, orderParameter, parametersWithoutOrder());
        };
        return _.extend({}, getters, {
            parameters: parameters,
            parametersWithoutOrder: parametersWithoutOrder
        });
    };
}), function(factory) {
    "object" == typeof exports ? factory(require("mithril"), require("underscore")) : factory(window.m, window._);
}(function(m, _) {
    m.postgrest.paginationVM = function(pageRequest, order) {
        var collection = m.prop([]), defaultOrder = order || "id.desc", filters = m.prop({
            order: defaultOrder
        }), isLoading = m.prop(!1), page = m.prop(1), total = m.prop(), fetch = function() {
            var d = m.deferred(), getTotal = function(xhr) {
                if (!xhr || 0 === xhr.status) return JSON.stringify({
                    hint: null,
                    details: null,
                    code: 0,
                    message: "Connection error"
                });
                var rangeHeader = xhr.getResponseHeader("Content-Range");
                _.isString(rangeHeader) && rangeHeader.split("/").length > 1 && total(parseInt(rangeHeader.split("/")[1]));
                try {
                    return JSON.parse(xhr.responseText), xhr.responseText;
                } catch (ex) {
                    return JSON.stringify({
                        hint: null,
                        details: null,
                        code: 0,
                        message: xhr.responseText
                    });
                }
            };
            return isLoading(!0), pageRequest(page(), filters(), {
                background: !0,
                extract: getTotal
            }).then(function(data) {
                collection(_.union(collection(), data)), isLoading(!1), d.resolve(collection()), 
                m.redraw();
            }, function(error) {
                isLoading(!1), total(0), d.reject(error), m.redraw();
            }), d.promise;
        }, firstPage = function(parameters) {
            return filters(_.extend({
                order: defaultOrder
            }, parameters)), collection([]), page(1), fetch();
        }, nextPage = function() {
            return page(page() + 1), fetch();
        };
        return {
            collection: collection,
            firstPage: firstPage,
            isLoading: isLoading,
            nextPage: nextPage,
            total: total
        };
    };
});