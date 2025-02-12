import {actionsSchema, scrapeOptions} from '../../api/src/controllers/v1/types';
import {describe, it, expect} from '@jest/globals';

describe('Schema Validation Tests', () => {
  describe('Actions Schema Validation', () => {
    it('should allow valid actions within limits', () => {
      const validActions = [
        {type: 'wait', milliseconds: 1000},
        {type: 'click', selector: '#button'},
        {type: 'screenshot', fullPage: false},
        {type: 'write', text: 'olá - hello'},
        {type: 'press', key: 'Enter'},
        {type: 'scroll', direction: 'down'},
        {type: 'scrape'},
        {type: 'executeJavascript', script: 'console.log("test")'},
      ];

      const result = actionsSchema.safeParse(validActions);
      expect(result.success).toBe(true);
    });

    it('should reject more than 15 actions', () => {
      const tooManyActions = Array(16).fill({type: 'click', selector: '#button'});

      const result = actionsSchema.safeParse(tooManyActions);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Maximum of 15 actions allowed');
      }
    });

    describe('Wait Action Validations', () => {
      it('should validate wait with milliseconds', () => {
        const validWait = [{type: 'wait', milliseconds: 1000}];
        expect(actionsSchema.safeParse(validWait).success).toBe(true);

        const invalidWait = [{type: 'wait', milliseconds: -1000}];
        expect(actionsSchema.safeParse(invalidWait).success).toBe(false);
      });

      it('should validate wait with selector', () => {
        const validWait = [{type: 'wait', selector: '#element'}];
        expect(actionsSchema.safeParse(validWait).success).toBe(true);
      });

      it('should reject wait with both milliseconds and selector', () => {
        const invalidWait = [{type: 'wait', milliseconds: 1000, selector: '#element'}];
        const result = actionsSchema.safeParse(invalidWait);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toBe(
            "Either 'milliseconds' or 'selector' must be provided, but not both.",
          );
        }
      });

      it('should reject wait without either milliseconds or selector', () => {
        const invalidWait = [{type: 'wait'}];
        const result = actionsSchema.safeParse(invalidWait);
        expect(result.success).toBe(false);
      });

      it('should reject when total wait time exceeds 60 seconds', () => {
        const longWaitActions = [
          {type: 'wait', milliseconds: 50000},
          {type: 'wait', milliseconds: 11000},
        ];

        const result = actionsSchema.safeParse(longWaitActions);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toBe(
            'Total wait time (waitFor + wait actions) cannot exceed 60 seconds',
          );
        }
      });

      it('should count selector waits as 1 second each', () => {
        // 15 selector clicks = 15 seconds total, should pass
        const maxWaitSelectors = Array(15).fill({type: 'click', selector: '#element'});
        const result = actionsSchema.safeParse(maxWaitSelectors);
        expect(result.success).toBe(true);

        // Test the time limit with mixed waits
        const mixedWaits = [
          {type: 'wait', milliseconds: 58000}, // 58 seconds
          {type: 'wait', selector: '#element'}, // 1 second
          {type: 'wait', selector: '#load-more-button'}, // 1 second
          {type: 'wait', selector: '#toomuch'}, // 1 second, exceeds 60 seconds total
        ];
        const timeFailResult = actionsSchema.safeParse(mixedWaits);
        expect(timeFailResult.success).toBe(false);
        if (!timeFailResult.success) {
          expect(timeFailResult.error.errors[0].message).toBe(
            'Total wait time (waitFor + wait actions) cannot exceed 60 seconds',
          );
        }
      });
    });

    describe('Other Action Type Validations', () => {
      it('should validate click action', () => {
        const validClick = [{type: 'click', selector: '#button'}];
        expect(actionsSchema.safeParse(validClick).success).toBe(true);

        const invalidClick = [{type: 'click'}];
        expect(actionsSchema.safeParse(invalidClick).success).toBe(false);
      });

      it('should validate screenshot action', () => {
        const validScreenshot = [{type: 'screenshot', fullPage: true}];
        expect(actionsSchema.safeParse(validScreenshot).success).toBe(true);

        const defaultScreenshot = [{type: 'screenshot', fullPage: false}];
        const result = actionsSchema.safeParse(defaultScreenshot);
        expect(result.success).toBe(true);
      });

      it('should validate write action', () => {
        const validWrite = [{type: 'write', text: 'hello'}];
        expect(actionsSchema.safeParse(validWrite).success).toBe(true);

        const invalidWrite = [{type: 'write'}];
        expect(actionsSchema.safeParse(invalidWrite).success).toBe(false);
      });

      it('should validate press action', () => {
        const validPress = [{type: 'press', key: 'Enter'}];
        expect(actionsSchema.safeParse(validPress).success).toBe(true);

        const invalidPress = [{type: 'press'}];
        expect(actionsSchema.safeParse(invalidPress).success).toBe(false);
      });

      it('should validate scroll action', () => {
        const validScroll = [{type: 'scroll', direction: 'up', selector: '#element'}];
        expect(actionsSchema.safeParse(validScroll).success).toBe(true);

        const defaultScroll = [{type: 'scroll', direction: 'down'}];
        const result = actionsSchema.safeParse(defaultScroll);
        expect(result.success).toBe(true);

        const invalidDirection = [{type: 'scroll', direction: 'left'}];
        expect(actionsSchema.safeParse(invalidDirection).success).toBe(false);
      });

      it('should validate scrape action', () => {
        const validScrape = [{type: 'scrape'}];
        expect(actionsSchema.safeParse(validScrape).success).toBe(true);
      });

      it('should validate executeJavascript action', () => {
        const validJs = [{type: 'executeJavascript', script: 'console.log("test")'}];
        expect(actionsSchema.safeParse(validJs).success).toBe(true);

        const invalidJs = [{type: 'executeJavascript'}];
        expect(actionsSchema.safeParse(invalidJs).success).toBe(false);
      });
    });
  });

  describe('Scrape Options Schema Validation', () => {
    it('should validate waitFor limit', () => {
      const validOptions = {
        waitFor: 60000, // 60 seconds
      };
      expect(scrapeOptions.safeParse(validOptions).success).toBe(true);

      const invalidOptions = {
        waitFor: 61000, // 61 seconds
      };
      expect(scrapeOptions.safeParse(invalidOptions).success).toBe(false);
    });

    describe('Combined Wait Time Validations', () => {
      it('should validate combined waitFor and actions wait time', () => {
        // Test valid combination (at the limit)
        const validOptions = {
          waitFor: 30000, // 30 seconds
          actions: [
            {type: 'wait', milliseconds: 29000}, // 29 seconds
            {type: 'wait', selector: '#element'}, // 1 second
          ],
        };
        expect(scrapeOptions.safeParse(validOptions).success).toBe(true);

        // Test invalid combination (exceeds limit)
        const invalidOptions = {
          waitFor: 30000, // 30 seconds
          actions: [
            {type: 'wait', milliseconds: 29000}, // 29 seconds
            {type: 'wait', selector: '#element'}, // 1 second
            {type: 'wait', selector: '#another'}, // 1 second
          ],
        };
        const failResult = scrapeOptions.safeParse(invalidOptions);
        expect(failResult.success).toBe(false);
        if (!failResult.success) {
          expect(failResult.error.errors[0].message).toBe(
            'Total wait time (waitFor + wait actions) cannot exceed 60 seconds',
          );
        }
      });

      it('should handle edge cases of combined wait times', () => {
        // Test with only waitFor at limit
        const maxWaitFor = {
          waitFor: 60000, // 60 seconds
          actions: [
            {type: 'write', text: 'Olá galera!'}, // non-wait action
          ],
        };
        expect(scrapeOptions.safeParse(maxWaitFor).success).toBe(true);

        // Test with only action waits at limit
        const maxActionWaits = {
          waitFor: 0,
          actions: [
            {type: 'wait', milliseconds: 59000}, // 59 seconds
            {type: 'wait', selector: '#element'}, // 1 second
          ],
        };
        expect(scrapeOptions.safeParse(maxActionWaits).success).toBe(true);

        // Test with mixed waits slightly over limit
        const slightlyOver = {
          waitFor: 30000, // 30 seconds
          actions: [
            {type: 'wait', milliseconds: 30000}, // 30 seconds
            {type: 'wait', selector: '#element'}, // 1 second
          ],
        };
        const overResult = scrapeOptions.safeParse(slightlyOver);
        expect(overResult.success).toBe(false);
        if (!overResult.success) {
          expect(overResult.error.errors[0].message).toBe(
            'Total wait time (waitFor + wait actions) cannot exceed 60 seconds',
          );
        }
      });
    });

    describe('Format Validations', () => {
      it('should validate screenshot format combinations', () => {
        const validScreenshot = {
          formats: ['screenshot'],
        };
        expect(scrapeOptions.safeParse(validScreenshot).success).toBe(true);

        const validFullPage = {
          formats: ['screenshot@fullPage'],
        };
        expect(scrapeOptions.safeParse(validFullPage).success).toBe(true);

        const invalidBoth = {
          formats: ['screenshot', 'screenshot@fullPage'],
        };
        expect(scrapeOptions.safeParse(invalidBoth).success).toBe(false);
      });

      it('should default to markdown format', () => {
        const noFormat = {};
        const result = scrapeOptions.safeParse(noFormat);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.formats).toEqual(['markdown']);
        }
      });
    });
  });
});
