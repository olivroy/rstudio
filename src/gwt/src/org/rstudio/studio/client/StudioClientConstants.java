/*
 * StudioClientConstants.java
 *
 * Copyright (C) 2021 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client;

public interface StudioClientConstants extends com.google.gwt.i18n.client.Messages {

    /**
     * Translated "Loading session...".
     *
     * @return translated "Loading session..."
     */
    @DefaultMessage("Loading session...")
    @Key("loadingSessionsText")
    String loadingSessionsText();

    /**
     * Translated "Error: {0}".
     *
     * @return translated "Error: {0}"
     */
    @DefaultMessage("Error: {0}")
    @Key("errorText")
    String errorText(String errorMessage);
}