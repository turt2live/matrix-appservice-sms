var LogService = require("../LogService");
var TwilioSmsSender = require("../twilio/TwilioSmsSender");
var PhoneNumberCache = require("./PhoneNumberCache");
var contentRepo = require("matrix-js-sdk/src/content-repo");


/**
 * Handles processing outbound SMS
 */
class SmsSender {
    /**
     * Sets the bridge to use in this sender
     * @param {TwilioBridge} bridge the bridge
     * @param config the configuration to use
     */
    setBridge(bridge, config) {
        this._bridge = bridge;
        TwilioSmsSender.init(config);
    }

    /**
     * Processes a matrix event to send an SMS to applicable recipients.
     * @param {MatrixEvent} event the event to process
     */
    emitMessage(event) {
        var fromPhone = PhoneNumberCache.getNumberForRoom(event.room_id);
        if (!fromPhone) {
            LogService.warn("SmsSender", "Failed to process event " + event.event_id + " (sender: " + event.sender + ") in room " + event.room_id + " because there is no routed phone number");
            return;
        }

        return this._bridge.getPhoneNumbersInRoom(event.room_id).then(phoneNumbers => {
            for (var number of phoneNumbers) {
                this._sendSms(fromPhone, number, event.content.body, event);
            }
        });
    }

    _sendSms(fromPhone, targetPhone, body, forEvent) {
        var intent = this._bridge.getTwilioIntent(targetPhone);

	// Check to see if this needs to go as MMS
	var mediaUrl = null;
	if ( forEvent.content.msgtype != 'm.text' && 'url' in forEvent.content ) {
        // SMELL: This is a really bad way to set the Ext URL.  Revisit this!!!
       mediaUrl = contentRepo.getHttpUriForMxc("https://"+
         this._bridge._config.homeserver.domain,
		   forEvent.content.url);
	}

        TwilioSmsSender.send(fromPhone, targetPhone, body, mediaUrl)
            .then(() => intent.sendReadReceipt(forEvent.room_id, forEvent.event_id))
            .catch(err => {
                LogService.error("SmsSender", "Error sending SMS message from " + fromPhone + " to " + targetPhone + " in room " + forEvent.room_id);
                LogService.error("SmsSender", err);
                intent.sendMessage(forEvent.room_id, {
                    msgtype: "m.notice",
                    body: "There was an error sending your text message. Please try again later or contact the bridge operator."
                });
            });
    }
}

module.exports = new SmsSender();
