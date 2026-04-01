import axios from 'axios';

export class SmsService {
    /**
     * Send SMS using 24x7SMS API 2.0
     * @param {Object} options 
     */
    static async sendSms({
        apiKey,
        mobileNo,
        message,
        senderId,
        serviceName = 'TEMPLATE_BASED',
        peid,
        dltTemplateId,
        unicode = false,
        scheduleDate
    }) {
        let baseUrl = "https://smsapi.24x7sms.com/api_2.0/SendSMS.aspx";
        if (unicode) {
            baseUrl = "https://smsapi.24x7sms.com/api_2.0/SendUnicodeSMS.aspx";
        }

        const params = {
            APIKEY: apiKey,
            MobileNo: mobileNo,
            SenderID: senderId,
            Message: message,
            ServiceName: serviceName
        };

        if (peid) params.peid = peid;
        if (dltTemplateId) params.DLTTemplateID = dltTemplateId;
        if (scheduleDate) params.ScheduleDate = scheduleDate;

        try {
            console.log(`DEBUG: Calling 24x7SMS API: ${baseUrl}`);
            const response = await axios.get(baseUrl, { params });
            const responseText = response.data;
            console.log(`DEBUG: Raw Response from API: ${responseText}`);
            return this.parseResponse(responseText);
        } catch (error) {
            return {
                status: 'FAILED',
                error: error.message
            };
        }
    }

    /**
     * Parse the raw response from 24x7SMS
     * @param {string} responseText 
     */
    static parseResponse(responseText) {
        if (typeof responseText !== 'string') {
            return { status: 'FAILED', error: 'Invalid response format' };
        }

        if (responseText.includes(':')) {
            const parts = responseText.split(':');
            if (parts[0].toUpperCase() === 'MSGID' && parts.length >= 3) {
                return {
                    status: 'SUCCESS',
                    msgId: parts[1],
                    mobileNo: parts[2],
                    batchId: parts[3] || 'N/A'
                };
            } else if (parts.length >= 3) {
                return {
                    status: 'SUCCESS',
                    msgId: parts[0],
                    mobileNo: parts[1],
                    batchId: parts[2]
                };
            }
        }

        return {
            status: 'FAILED',
            error: responseText
        };
    }
}
