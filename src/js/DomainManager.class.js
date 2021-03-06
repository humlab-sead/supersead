//import Config from '../config/config.js';

class DomainManager {

    constructor(sqs) {
        this.sqs = sqs;
        this.config = Config;
        this.activeDomain = this.getDomain(Config.activeDomain);
        this.updateMenu();

        /* PROBLEM: If this auto-shows when exiting desktop mode, it will also try to render itself in the site reports, which we dont want
        //FIXME: This event doesn't get caught because the layout manager inits before the domain manager and sends out the event before this has started listening
        this.sqs.sqsEventListen("layoutChange", (evt, mode) => {
            if(mode == "mobileMode") {
                $("#domain-menu").hide();
            }
            if(mode == "desktopMode") {
                $("#domain-menu").show();
            }
        });
        */

        this.sqs.sqsEventListen("domainChanged", (evt, newDomainName) => {
            /* DISABLED colors for now, there's too many domains for this to work well - I think...
            let newDomain = this.getDomain(newDomainName);
            $("#facet-menu .l2-title").css("border-left", "4px solid "+newDomain.color);
            */
        });
        
        $(window).on("seadStatePreLoad", (event, data) => {
            let state = data.state;
            if(state.domain) {
                this.setActiveDomain(state.domain);
            }
        });
    }

    getDomain(domainName) {
        for(let key in this.config.domains) {
            if(this.config.domains[key].name == domainName) {
                return this.config.domains[key];
            }
        }
    }

    getActiveDomain() {
        return this.activeDomain;
    }

    setActiveDomain(domainName, updateUrl = true) {
        this.activeDomain = this.getDomain(domainName);
        this.updateMenu();
        
        if(updateUrl) {
            let domainPath = "";
            if(domainName != "general") {
                domainPath = domainName;
            }
            
            window.history.pushState({ domain: domainName },
                "SEAD",
                "/"+domainPath);
        }
        this.sqs.sqsEventDispatch("domainChanged", domainName);
    }
    
    updateMenu() {
        this.sqs.menuManager.createMenu(this.sqsMenu());
        //$("#domain-menu .sqs-menu-title-subtext").css("background-color", this.activeDomain.color);
    }

    /*
	* Function: sqsMenu
	*/
	sqsMenu() {
        var menu = {
            title: "Domain",
            subText: this.activeDomain.title,
            layout: "vertical",
            collapsed: true,
            anchor: "#domain-menu",
            customStyleClasses: "sqs-menu-block-vertical-flexible",
            weight: 1,
            staticSelection: true,
            items: []
        };

        let selectedDomain = this.getActiveDomain();

        for(let key in this.config.domains) {
            let domain = config.domains[key];

            menu.items.push({
                name: domain.name,
                title: domain.icon+" "+domain.title,
                staticSelection: domain.name == selectedDomain.name,
                callback: () => {
                    this.setActiveDomain(domain.name);
                }
            });
        }
        
        return menu;
    }

}

export { DomainManager as default }